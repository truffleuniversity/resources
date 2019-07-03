---
title: Contribution Guidelines
date: "2019-05-08T16:20:39.714Z"
description: Process for contributing to Truffle University Resources 🍫
---

Contributions to [Truffle University Resources](https://resources.truffle.university/) are very much welcome. For reference it uses the [Docz](https://www.docz.site/) documentation generator packaged as a [Gatsby Theme](https://www.gatsbyjs.org/docs/themes/), and running on [Netlify](https://www.netlify.com). That said, you don't need to worry about any of this detail to contribute...

## Contribution Steps

- Create a new branch from `master`
- If you originally published your blog with medium you can use [medium-2-md](https://www.npmjs.com/package/medium-2-md) to convert it to markdown 
- Open the relevant file in the `docs` or `blog` directory and edit the [mdx](https://mdxjs.com/) (which is just [markdown](https://www.markdownguide.org/) with JSX only interleaved if you want to add in-page [interactivity](https://reactjs.org/docs/introducing-jsx.html))
- Commit and create a [Pull Request](https://github.com/truffleuniversity/resources/pulls)

## Local Development

We can easily update our site and watch it change in real time.

First we want to clone the [repository](https://github.com/truffleuniversity/resources).

Install the Gatsby CLI.

```
npm install -g gatsby-cli
```

Change directories into site folder that you cloned.

```
cd ./resources
```

We can run our Gatsby site locally in the development mode.

```
gatsby develop
```

Gatsby will start a hot-reloading development environment accessible by default at *localhost:8000*. Open it up in your browser.

Try editing the pages in `docs` or `blogs` directory. Saved changes will live reload in the browser.

Suggestions on changing or improving any of the above are very welcome.