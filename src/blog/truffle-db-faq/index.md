---
name: Truffle DB FAQs
date: '2019-06-27'
description: Some answers to questions that came out of Faina's Truffle DB sessions.
menu: Articles
---

Below are some questions that came up as part of Faina's session on the upcoming Truffle DB...

### On the "DB"

The data inside the db will eventually be saved in a way similar to the way artifacts are (the persistence stuff I talk about in the presentation). There isn’t a physical “db” in the way you may be used to, like with Mongo or MySQL. The “db” is actually the data saved in keeping with a GraphQL “schema” format, from which we can use GraphQL queries to get the information we want. So there shouldn’t be a need to swap anything out. Every project will have its own data persisted in this way, inside the project at least at first.

The general idea though, is that Truffle DB will agnostic to where the data is stored, as long as the data storage is formatted in a way that is consistent with the GraphQL schema and can therefore be queried.

### On the Persistence Layer

The initial “persistence layer” will most likely be saved in a `.db` file in your build directory, with the first iteration being a flat JSON file for each type of data (contract instances, byte codes, etc. — basically anything labelled a “Resource” in the data model I linked to will have its own JSON file which will hold schema-appropriate data for every iteration of that resource in your project that can be queried with TruffleDB).

It is possible in the future that the data being stored this way will need more sophisticated storage, and that is something we’ve scoped for future consideration.

### On pouchDB

Once the MVP of Truffle is released, the pouchDB part will not be something the end user needs to worry about. The data needed for GraphQL will be loaded automatically into persistent JSON files and will be accessible to Truffle DB. I am currently writing up the documentation of how you’ll be able to interact with Truffle DB in your project, but the specifics are still being pinned down. I expect something along the lines of requiring truffle-db in your project and then being able to interact with it via particular commands.

### Is there an ORM that lets you choose the db of your choice (in memory or otherwise)?

No. That’s not something currently on the roadmap, though definitely worth considering! I think the main thrust of the project is to make this data persistent, so the in-memory piece will probably fall to the wayside though it may be worth having it as an option during testing.

### Does “persistence” in this context mean not having to load it to “truffle db” in-memory each time?

Yes. In the MVP, the data needed for Truffle DB will be saved in a `.db` file so you won’t need to worry about that piece. There will be documentation on how to interact with Truffle DB when the MVP is released.