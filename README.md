# CLI Agent Project

This project aims to create a secure and helpful CLI agent using TypeScript and LangChain.

## Current Stage
The project is in its starting stages, and I will be researching and building it day by day.

## Technologies Used
- TypeScript
- Docker

## Goal
Create a CLI agent that can assist with various tasks while ensuring security and safety.

### API key format
- Use `GROQ_API_KEY` for the primary key.
- Add extra keys in increasing numeric order: `GROQ_API_KEY2`, `GROQ_API_KEY3`, `GROQ_API_KEY4`, and so on.
- Do not skip numbers when adding extra keys.

### Requirements
- Docker Desktop or Docker Engine
- A `.env` file based on `.env.example`

### Notes
- The container image includes Git, so commands like `git init` can run inside Docker.

### Use another folder as the workspace
- Run:
```powershell
docker compose -f C:\Users\User\Desktop\Agents\TSAgent\docker-compose.yml run --rm -e AGENT_WORKSPACE=/workspace -v "{your-repo's-absolute-path}:/workspace" tsagent
```

This runs the app inside Docker while letting it read and edit the mounted host folder.
