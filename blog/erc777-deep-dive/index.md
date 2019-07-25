---
title: Deep Dive - Open Zeppelin's ERC777 Implementation 
date: "2019-07-24"
description: A detailed look at ERC777 with comparisons to ERC20.
author: "Kyle Liu"
---

By: [Kyle L](https://medium.com/@kyle_59823)

[OpenZeppelin](https://openzeppelin.org) recently published their implementation of the surging fungible-token [standard](https://eips.ethereum.org/EIPS/eip-777) ERC777. The purpose of ERC777 is to improve upon ERC20 while maintaining backward compatibility. The contract comes with two hooks, `tokensToSend` and `tokensReceived`, that addresses may implement to control and revert token operations. Accounts can now receive funds and a notification within a single transaction, supplanting the two-step process (`approve`/`transferFrom`) in ERC20. Let's jump right in.

## The Interface

```
  interface ERC777Token {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function totalSupply() external view returns (uint256);
    function balanceOf(address holder) external view returns (uint256);
    function granularity() external view returns (uint256);

    function defaultOperators() external view returns (address[] memory);
    function isOperatorFor(
        address operator,
        address holder
    ) external view returns (bool);
    function authorizeOperator(address operator) external;
    function revokeOperator(address operator) external;

    function send(address to, uint256 amount, bytes calldata data) external;
    function operatorSend(
        address from,
        address to,
        uint256 amount,
        bytes calldata data,
        bytes calldata operatorData
    ) external;

    function burn(uint256 amount, bytes calldata data) external;
    function operatorBurn(
        address from,
        uint256 amount,
        bytes calldata data,
        bytes calldata operatorData
    ) external;

    event Sent(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes data,
        bytes operatorData
    );
    event Minted(
        address indexed operator,
        address indexed to,
        uint256 amount,
        bytes data,
        bytes operatorData
    );
    event Burned(
        address indexed operator,
        address indexed from,
        uint256 amount,
        bytes data,
        bytes operatorData
    );
    event AuthorizedOperator(
        address indexed operator,
        address indexed holder
    );
    event RevokedOperator(address indexed operator, address indexed holder);
  }
```
A glaring difference between 777 and ERC20 is the addition of operators. Token holders can authorize and revoke trusted entities to act on their behalf. Contract deployers may define default operators who can move tokens for all addresses. Notice that `send` is used in place of `transfer` and `transferFrom`, mirroring the transfer of Ether.

## The Contract

```
  contract ERC777 is IERC777, IERC20 {
    using SafeMath for uint256;
    using Address for address;

    IERC1820Registry private _erc1820 = 
      IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);

    mapping(address => uint256) private _balances;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    // We inline the result of the following hashes because 
    // Solidity doesn't resolve them at compile time.
    // See https://github.com/ethereum/solidity/issues/4024.

    // keccak256("ERC777TokensSender")
    bytes32 constant private TOKENS_SENDER_INTERFACE_HASH =
      0x29ddb589b1fb5fc7cf394961c1adf5f8c6454761adf795e67fe149f658abe895;

    // keccak256("ERC777TokensRecipient")
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH =
      0xb281fc8c12954d22544db45de3159a39272895b169a852b314f9cc762e44c53b;

    // This isn't ever read from - it's only used to respond to the 
    // defaultOperators query.
    address[] private _defaultOperatorsArray;

    // Immutable, but accounts may revoke them 
    // (tracked in __revokedDefaultOperators).
    mapping(address => bool) private _defaultOperators;

    // For each account, a mapping of its operators and 
    // revoked default operators.
    mapping(address => mapping(address => bool)) private _operators;
    mapping(address => mapping(address => bool)) 
      private _revokedDefaultOperators;

    // ERC20-allowances
    mapping (address => mapping (address => uint256)) private _allowances;
```

We begin with the contract definition and variable declarations. ERC777 inherits from the interface defined in the EIP as well as from the ERC20 interface. An introspection registry (ERC1820) where contracts and regular addresses publish the functionality they implement, is required. The two hardcoded hashes will see use later when we call our send/receive hooks.

```
    /**
     * @dev `defaultOperators` may be an empty array.
     */
    constructor(
        string memory name,
        string memory symbol,
        address[] memory defaultOperators
    ) public {
        _name = name;
        _symbol = symbol;

        _defaultOperatorsArray = defaultOperators;
        for (uint256 i = 0; i < _defaultOperatorsArray.length; i++) {
            _defaultOperators[_defaultOperatorsArray[i]] = true;
        }

        // register interfaces
        _erc1820.setInterfaceImplementer(address(this), 
          keccak256("ERC777Token"), address(this));
        _erc1820.setInterfaceImplementer(address(this), 
          keccak256("ERC20Token"), address(this));
    }
```

The constructor intakes three arguments: the `name` of the token, the `symbol` of the token (DAI, BAT…etc), and an array `defaultOperators` to hold a list of addresses. Private variables are assigned. The contract then proclaims its ERC777/ERC20 interfaces with the registry.

The `view` functions look as expected. ERC20 compliance requires the implementation of `decimals`.

## Send

```
    /**
     * @dev See `IERC777.send`.
     *
     * Also emits a `Transfer` event for ERC20 compatibility.
     */
    function send(address recipient, uint256 amount, bytes calldata data) 
      external {
        _send(msg.sender, msg.sender, recipient, amount, data, "", true);
    }
```

We've arrived at `send`, the quintessential method which moves tokens between accounts. The `_send` call nested inside will also be called by `operatorSend` (which we will get to later).

```
    /**
     * @dev Send tokens
     * @param operator address operator requesting the transfer
     * @param from address token holder address
     * @param to address recipient address
     * @param amount uint256 amount of tokens to transfer
     * @param userData bytes extra information provided by the token holder 
     * (if any)
     * @param operatorData bytes extra information provided by the operator 
     * (if any)
     * @param requireReceptionAck if true, contract recipients are required 
     * to implement ERC777TokensRecipient
     */
    function _send(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes memory userData,
        bytes memory operatorData,
        bool requireReceptionAck
    )
        private
    {
        require(from != address(0), "ERC777: send from the zero address");
        require(to != address(0), "ERC777: send to the zero address");

        _callTokensToSend(operator, from, to, amount, userData, 
          operatorData);

        _move(operator, from, to, amount, userData, operatorData);

        _callTokensReceived(operator, from, to, amount, userData, 
          operatorData, requireReceptionAck);
    }
```
```
    function _move(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes memory userData,
        bytes memory operatorData
    )
        private
    {
        _balances[from] = _balances[from].sub(amount);
        _balances[to] = _balances[to].add(amount);

        emit Sent(operator, from, to, amount, userData, operatorData);
        emit Transfer(from, to, amount);
    }
```

`_send` requires that from and to cannot be the zero address. Notice that `_move` is the one who moves the needle (and emit two `events`, one for each token standard). `_callTokensToSend` & `_callTokensReceived` is the duo responsible for calling the previously mentioned hook functions.

## The Send Hook

```

    /**
     * @dev Call from.tokensToSend() if the interface is registered
     * @param operator address operator requesting the transfer
     * @param from address token holder address
     * @param to address recipient address
     * @param amount uint256 amount of tokens to transfer
     * @param userData bytes extra information provided by the token holder 
     * (if any)
     * @param operatorData bytes extra information provided by the operator 
     * (if any)
     */
    function _callTokensToSend(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes memory userData,
        bytes memory operatorData
    )
        private
    {
        address implementer = _erc1820.getInterfaceImplementer(from,
          TOKENS_SENDER_INTERFACE_HASH);
        if (implementer != address(0)) {
            IERC777Sender(implementer).tokensToSend(operator, from, to, 
              amount, userData, operatorData);
        }
    }
```

```
  interface IERC777Sender {
    /**
     * @dev Called by an `IERC777` token contract whenever a 
     * registered holder's (`from`) tokens are about to be moved or  
     * destroyed. The type of operation is conveyed by `to` being the 
     * zero address or not.
     * This call occurs _before_ the token contract's state is updated, so
     * `IERC777.balanceOf`, etc., can be used to query the pre-operation 
     * state.
     * This function may revert to prevent the operation from being executed.
     */
    function tokensToSend(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    ) external;
  }
```

`_callTokensToSend` first checks with the introspection registry that the `from` address in our transaction implements the send-hook. This enables us to call `IERC777Sender(implementer).tokensToSend`. Upon firing, the `from` address should receive a prompt (This will depend on the wallet implementation of the interface) allowing the sender to revert the transaction.

## The Receive Hook

```
    /**
     * @dev Call to.tokensReceived() if the interface is registered. 
     * Reverts if the recipient is a contract but
     * tokensReceived() was not registered for the recipient
     * @param operator address operator requesting the transfer
     * @param from address token holder address
     * @param to address recipient address
     * @param amount uint256 amount of tokens to transfer
     * @param userData bytes extra information provided by the token holder 
     * (if any)
     * @param operatorData bytes extra information provided by the operator 
     * (if any)
     * @param requireReceptionAck if true, contract recipients are required 
     * to implement ERC777TokensRecipient
     */
    function _callTokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes memory userData,
        bytes memory operatorData,
        bool requireReceptionAck
    )
        private
    {
        address implementer = _erc1820.getInterfaceImplementer(to,
          TOKENS_RECIPIENT_INTERFACE_HASH);
        if (implementer != address(0)) {
            IERC777Recipient(implementer).tokensReceived(operator, from, to, 
              amount, userData, operatorData);
        } else if (requireReceptionAck) {
            require(!to.isContract(), "ERC777: token recipient contract has 
            no implementer for ERC777TokensRecipient");
        }
    }
```
```
  interface IERC777Recipient {
    /**
     * @dev Called by an `IERC777` token contract whenever tokens 
     * are being moved or created into a registered account (`to`). 
     * The type of operation is conveyed by `from` 
     * being the zero address or not.
     * This call occurs _after_ the token contract's state is updated, so
     * `IERC777.balanceOf`, etc., can be used to query the post-operation 
     * state.
     * This function may revert to prevent the operation from being executed.
     */
    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    ) external;
  }
```

`_callTokensReceived` should feel familiar. The `else if` at the end will revert if `requireReceptionAck` is `true` && `to` is a contract. `requireReceptionAck` is `false` only when an ERC20 function (`transfer`, `transferFrom`) calls `_callTokensReceived`. Recall that ERC777 inherits from ERC20. Upon invoking `tokensReceived`, the receiver will get a notification that someone is sending them some tokens, and allowing the receiver to revert.

## Mint

```
    /**
     * @dev Creates `amount` tokens and assigns them to `account`, 
     * increasing the total supply.
     *
     * If a send hook is registered for `account`, the corresponding function
     * will be called with `operator`, `data` and `operatorData`.
     *
     * See `IERC777Sender` and `IERC777Recipient`.
     *
     * Emits `Minted` and `Transfer` events.
     *
     * Requirements
     *
     * - `account` cannot be the zero address.
     * - if `account` is a contract, it must implement the `tokensReceived`
     * interface.
     */
    function _mint(
        address operator,
        address account,
        uint256 amount,
        bytes memory userData,
        bytes memory operatorData
    )
    internal
    {
        require(account != address(0), "ERC777: mint to the zero address");

        // Update state variables
        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);

        _callTokensReceived(operator, address(0), account, amount, userData, 
          operatorData, true);

        emit Minted(operator, account, amount, userData, operatorData);
        emit Transfer(address(0), account, amount);
    }
```

A 777-derived contract is meant to call `_mint` since the authors chose to remain agnostic in token creation methodologies. State variables are updated to reflect the minting. The receiver of the newly minted coins gets notified so long as the receive-hook is at the ready. Finally, the method emits the `Minted` (ERC777) and `Transfer` (ERC20) events.

## Burn

```
    /**
     * @dev See `IERC777.burn`.
     *
     * Also emits a `Transfer` event for ERC20 compatibility.
     */
    function burn(uint256 amount, bytes calldata data) external {
        _burn(msg.sender, msg.sender, amount, data, "");
    }
    
    /**
     * @dev Burn tokens
     * @param operator address operator requesting the operation
     * @param from address token holder address
     * @param amount uint256 amount of tokens to burn
     * @param data bytes extra information provided by the token holder
     * @param operatorData bytes extra information provided by the operator 
     * (if any)
     */
    function _burn(
        address operator,
        address from,
        uint256 amount,
        bytes memory data,
        bytes memory operatorData
    )
        private
    {
        require(from != address(0), "ERC777: burn from the zero address");

        _callTokensToSend(operator, from, address(0), amount, data, 
          operatorData);

        // Update state variables
        _totalSupply = _totalSupply.sub(amount);
        _balances[from] = _balances[from].sub(amount);

        emit Burned(operator, from, amount, data, operatorData);
        emit Transfer(from, address(0), amount);
    }
```

The functions `burn` and `operatorBurn` both invoke the underlying `_burn` method. The send-hook allows the burner to revert. `_totalSupply` and `_balances[from]` are updated appropriately.

## Operator send/burn

```
    /**
     * @dev See `IERC777.operatorSend`.
     *
     * Emits `Sent` and `Transfer` events.
     */
    function operatorSend(
        address sender,
        address recipient,
        uint256 amount,
        bytes calldata data,
        bytes calldata operatorData
    )
    external
    {
        require(isOperatorFor(msg.sender, sender), "ERC777: caller is not an 
          operator for holder");
        _send(msg.sender, sender, recipient, amount, data, operatorData, 
          true);
    }

    /**
     * @dev See `IERC777.operatorBurn`.
     *
     * Emits `Burned` and `Transfer` events.
     */
    function operatorBurn(
      address account, 
      uint256 amount, 
      bytes calldata data, 
      bytes calldata operatorData) external {
        require(isOperatorFor(msg.sender, account), "ERC777: caller is 
        not an operator for holder");
        _burn(msg.sender, account, amount, data, operatorData);
    }
```

As expected, these functions call the `_send` and `_burn` methods on behalf of the token holder.

## Operator Utils

```
    /**
     * @dev See `IERC777.authorizeOperator`.
     */
    function authorizeOperator(address operator) external {
        require(msg.sender != operator, "ERC777: authorizing self as 
          operator");

        if (_defaultOperators[operator]) {
            delete _revokedDefaultOperators[msg.sender][operator];
        } else {
            _operators[msg.sender][operator] = true;
        }

        emit AuthorizedOperator(operator, msg.sender);
    }

    /**
     * @dev See `IERC777.revokeOperator`.
     */
    function revokeOperator(address operator) external {
        require(operator != msg.sender, "ERC777: revoking self as 
          operator");

        if (_defaultOperators[operator]) {
            _revokedDefaultOperators[msg.sender][operator] = true;
        } else {
            delete _operators[msg.sender][operator];
        }

        emit RevokedOperator(operator, msg.sender);
    }
```

The `authorizeOperator` & `revokeOperator` both require `msg.sender` to not be the argument supplied. Both functions check to see if the `operator` is part of the list of default operators so that it may modify the corresponding array.

```
    /**
     * @dev See `IERC777.isOperatorFor`.
     */
    function isOperatorFor(
        address operator,
        address tokenHolder
    ) public view returns (bool) {
        return operator == tokenHolder ||
            (_defaultOperators[operator] && 
              !_revokedDefaultOperators[tokenHolder][operator]) ||
              _operators[tokenHolder][operator];
    }
    
    /**
     * @dev See `IERC777.defaultOperators`.
     */
    function defaultOperators() public view returns (address[] memory) {
        return _defaultOperatorsArray;
    }
```

`isOperatorFor` checks if a given user authorizes a given operator.

## Backward Compatibility

```
    /**
     * @dev See `IERC20.transfer`.
     *
     * Unlike `send`, `recipient` is _not_ required to implement the 
     * `tokensReceived`
     * interface if it is a contract.
     *
     * Also emits a `Sent` event.
     */
    function transfer(address recipient, uint256 amount) external returns 
      (bool) {
        require(recipient != address(0), "ERC777: transfer to the zero 
          address");

        address from = msg.sender;

        _callTokensToSend(from, from, recipient, amount, "", "");

        _move(from, from, recipient, amount, "", "");

        _callTokensReceived(from, from, recipient, amount, "", "", false);

        return true;
    }

    /**
     * @dev See `IERC20.allowance`.
     *
     * Note that operator and allowance concepts are orthogonal: operators 
     * may not have allowance, and accounts with allowance may not be 
     * operators themselves.
     */
    function allowance(address holder, address spender) public view returns 
      (uint256) {
        return _allowances[holder][spender];
    }

    /**
     * @dev See `IERC20.approve`.
     *
     * Note that accounts cannot have allowance issued by their operators.
     */
    function approve(address spender, uint256 value) external returns 
      (bool) {
        address holder = msg.sender;
        _approve(holder, spender, value);
        return true;
    }
    
    function _approve(address holder, address spender, uint256 value) 
      private {
        // TODO: restore this require statement if this function becomes 
        // internal, or is called at a new callsite. It is
        // currently unnecessary.
        //require(holder != address(0), "ERC777: approve from the zero 
          address");
        require(spender != address(0), "ERC777: approve to the zero 
          address");

        _allowances[holder][spender] = value;
        emit Approval(holder, spender, value);
    }

   /**
    * @dev See `IERC20.transferFrom`.
    *
    * Note that operator and allowance concepts are orthogonal: operators 
    * cannot call `transferFrom` (unless they have allowance), and 
    * accounts with allowance cannot call `operatorSend` 
    * (unless they are operators).
    * Emits `Sent`, `Transfer` and `Approval` events.
    */
    function transferFrom(address holder, address recipient, uint256 amount) 
      external returns (bool) {
        require(recipient != address(0), "ERC777: transfer to the zero 
          address");
        require(holder != address(0), "ERC777: transfer from the zero 
          address");

        address spender = msg.sender;

        _callTokensToSend(spender, holder, recipient, amount, "", "");

        _move(spender, holder, recipient, amount, "", "");
        _approve(holder, spender, _allowances[holder][spender].sub(amount));

        _callTokensReceived(spender, holder, recipient, amount, 
          "", "", false);

        return true;
    }
```
All of the ERC20 functions are implemented.

## Resources

- [EIP-777 Standard](https://eips.ethereum.org/EIPS/eip-777)
- [OpenZeppelin Github](https://github.com/OpenZeppelin/openzeppelin-contracts)/[Implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/tree/master/contracts/token/ERC777)
