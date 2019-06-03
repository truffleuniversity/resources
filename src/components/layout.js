import React from 'react'
import { navigate } from 'gatsby'
import { Button, Box, Heading } from 'rebass'
import { ThemeProvider } from 'styled-components'
import styled from 'styled-components'

import theme from '../utils/theme'
import { rhythm } from '../utils/typography'

const Header = styled(Box)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: ${p => p.theme.colors.lightgray};
`

const Container = styled(Box)`
  max-width: 720px;
  margin: 0 auto;
`

class Layout extends React.Component {
  render() {
    const { children } = this.props
    return (
      <ThemeProvider theme={theme}>
        <React.Fragment>
          <Header py={5} mb={5}>
            <Heading fontSize={[6, 7]} fontWeight={400} color={`#fff`}>Truffle University Resources</Heading>
            <Heading fontWeight={400} mt={2} color={`#3fe0c5`}>A living collection of guides, materials, projects, etc.</Heading>
            <Box display="flex" mt={4}>
              <Button variant="primary" onClick={() => navigate('/')}>
                Home
              </Button>
              <Button
                ml={2}
                variant="primary"
                onClick={() => navigate('/docs')}
              >
                Resources
              </Button>
            </Box>
          </Header>
          <Container>
            <main>{children}</main>
            <hr
              style={{
                marginTop: rhythm(1),
                marginBottom: rhythm(1),
              }}
            />
            <Box as="footer" mb={4}>
              © {new Date().getFullYear()}, Built with ❤ and 
              {` `}
              <a href="https://www.gatsbyjs.org">Gatsby</a>
            </Box>
          </Container>
        </React.Fragment>
      </ThemeProvider>
    )
  }
}

export default Layout
