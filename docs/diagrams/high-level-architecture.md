# High-Level Architecture Diagrams

## 1) End-to-end high-level system

```text
Recruiter / Hiring Manager
  -> Web Assets (Cloudflare)
  -> Worker API (/api/chat)
       - backend mode: upstream proxy or local corpus
       -> Vector Store (Vectorize, production target)
       -> Model Adapter + Embeddings Adapter

Curated Content (Markdown)
  -> Ingestion Pipeline (parse/chunk/embed/index)
  -> Vector Store
```

## 2) Runtime request path

```text
User question
  -> /api/chat
  -> retrieve top-k chunks
  -> assemble prompt (rules + TOON block + evidence)
  -> generate answer via model adapter
  -> attach citations
  -> return recruiter-facing response
```

## 3) Ingestion path

```text
content/*.md
  -> frontmatter checks
  -> chunking strategy
  -> embedding generation
  -> vector upsert
  -> ingestion report (counts, failures, metadata quality)
```

## 4) Future state with LangGraph

```text
User question
  -> API entry
  -> LangGraph orchestration (future)
       -> intent/classification node
       -> retrieval node
       -> optional clarification node
       -> response drafting node
       -> citation validation node
  -> final response
```
