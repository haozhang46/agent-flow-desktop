# Frontend Data Flow

## Electron → API

```mermaid
sequenceDiagram
  participant Electron as Electron (desktop)
  participant Preload as preload IPC
  participant Renderer as Nuxt renderer
  participant API as api (backend)

  Electron->>Preload: sidecar port / workspace
  Renderer->>API: POST /v1/chat (SSE)
  API-->>Renderer: stream tokens
  Note over Renderer,API: NUXT_PUBLIC_API_BASE points to api service
```

## Web SSR (optional fe-web service)

```mermaid
flowchart LR
  Browser --> nginx
  nginx --> fe-web
  fe-web --> api
  api --> db[(postgres)]
  api --> cache[(redis)]
```

## CDN (static assets)

Static assets for the web build may be served via CDN in production. Document CDN origin and cache rules here; CDN is not a topology node in v1.
