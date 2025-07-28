# EpicMe MCP

This is an example of an application that's exclusively accessible via Model
Context Protocol (MCP).

Everything from user registration and authentication to interacting with user
data is handled via MCP tools.

The goal is to demonstrate a possible future of applications where users
interact with our apps via natural language with LLMs and the MCP protocol. This
will also be the basis upon which I will teach how to build MCP tools on
[EpicAI.pro](https://www.epicai.pro).

## How to Use

**⚠️ Important Disclaimer: This is an experimental playground, not a production
service. There are no SLAs, guarantees of data privacy, or data retention
policies. Use at your own risk and don't store anything important or
sensitive.**

### Server URL

The EpicMe MCP server is deployed at:

```
https://epic-me-mcp.kentcdodds.workers.dev/mcp
```

### What You Can Do

EpicMe is a personal journaling application that allows you to:

- **Create and manage journal entries** with titles, content, mood, location,
  weather, and privacy settings
- **Organize entries with tags** for better categorization and filtering
- **Get AI-powered tag suggestions** for your entries
- **Summarize your journal entries** with optional filtering by tags or date
  range
- **Mark entries as favorites** and set privacy levels

### Getting Started

1. **Connect to the MCP server** using your preferred MCP client (like
   [Claude Desktop](https://claude.ai/download))
2. **Authenticate** by providing your email address - you'll receive a
   validation code
3. **Start journaling** using natural language commands

### Authentication Flow

The authentication is unique because it works with users who don't exist yet:

1. Use the `authenticate` tool with your email address
2. Check your email for a TOTP validation code
3. Use the `validate_token` tool with the code to complete authentication
4. You're now logged in and can access all authenticated features

### Available Tools

#### Authentication Tools (Unauthenticated)

- **`authenticate`** - Start authentication process with your email
- **`validate_token`** - Complete authentication with emailed validation code

#### User Management Tools (Authenticated)

- **`whoami`** - Get information about the current user
- **`logout`** - Remove authentication

#### Journal Entry Tools (Authenticated)

- **`create_entry`** - Create a new journal entry with optional tags, mood,
  location, weather
- **`get_entry`** - Retrieve a specific journal entry by ID
- **`list_entries`** - List all entries, optionally filtered by tags
- **`update_entry`** - Update any field of an existing entry
- **`delete_entry`** - Delete a journal entry

#### Tag Management Tools (Authenticated)

- **`create_tag`** - Create a new tag for organizing entries
- **`get_tag`** - Get details of a specific tag
- **`list_tags`** - List all your tags
- **`update_tag`** - Update tag properties
- **`delete_tag`** - Delete a tag
- **`add_tag_to_entry`** - Associate a tag with an entry

### Available Prompts

- **`suggest_tags`** - Get AI-powered tag suggestions for a specific journal
  entry
- **`summarize-journal-entries`** - Get a summary of your journal entries, with
  optional filtering by tags or date range

### Available Resources

- **`epicme://credits`** - Credits information
- **`epicme://users/current`** - Current user information
- **`epicme://entries/{id}`** - Specific journal entry data
- **`epicme://entries`** - List of all journal entries
- **`epicme://tags/{id}`** - Specific tag data
- **`epicme://tags`** - List of all tags

### Example Usage

Here are some example natural language commands you can use:

- "Authenticate me with my email address"
- "Create a new journal entry about my day at the beach"
- "List all my journal entries"
- "Show me entries tagged with 'work'"
- "Suggest tags for my latest entry"
- "Summarize my journal entries from last week"
- "Update my entry to mark it as a favorite"
- "Create a new tag called 'personal goals'"

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
