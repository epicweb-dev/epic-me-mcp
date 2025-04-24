# EpicMe MCP

This is an example of an application that's exclusively accessible via Model
Context Protocol (MCP).

Everything from user registration and authentication to interacting with user
data is handled via MCP tools.

The goal is to demonstrate a possible future of applications where users
interact with our apps via natural language with LLMs and the MCP protocol. This
will also be the basis upon which I will teach how to build MCP tools on
[EpicAI.pro](https://www.epicai.pro).

## Authentication

The authentication flow is unique because we need to be able to go through OAuth
for users who don't exist yet (users need to register first). So we generate a
grant automatically without the user having to go through the OAuth flow
themselves. Then we allow the user to claim the grant via a TOTP code which is
emailed to them.

This works well enough.

## Known Issues

During development, if you delete the `.wrangler` directory, you're deleting the
dynamically registered clients. Those clients don't know that their entries have
been deleted so they won't attempt to re-register. In the MCP Inspector, you can
go in the browser dev tools and clear the session storage and it will
re-register. In other clients I do not know how to make them re-register.
