# Roadmap

## Phase 1: Static Scaffold And Docs

Create project structure, design docs, and placeholder source folders.

## Phase 2: New Campaign Model And SQLite File

Define the initial campaign schema for people, party members, factions, places, inventory, lore,
timeline events, quests, relationships, scene state, combat state, D&D 5e-lite stat tracking, style
rules, and templates.

Create a new local `.lorekeeper.sqlite` campaign file and store starter state in it.

Keep JSON import/export as backup and migration tooling.

Add a local campaign-folder importer for existing continuity dump files and asset folders as a
secondary path.

## Phase 3: Lorekeeper App Tab / Side Panel UI

Build the local campaign interface for browsing state, preparing prompts, reviewing responses, and
managing imports/exports.

## Phase 4: Prompt Builder

Build prompt assembly from state, scene context, style rules, provider prompt templates, and
context-pack templates.

## Phase 5: Manual Copy / Import Workflow

Add copy prompt and import copied response flows so Lorekeeper is useful before DOM automation.

## Phase 6: ChatGPT Provider UI Adapter

Implement the first provider UI bridge adapter for ChatGPT.

## Phase 7: Claude Provider UI Adapter

Add a second adapter once the adapter boundary is proven.

## Phase 8: Automated Send / Wait / Import Loop

Connect provider tab selection, prompt sending, completion detection, and response import.

## Phase 9: Response Importer

Store raw responses, extract structured proposals, and connect imported output to review flows.

## Phase 10: State Extraction And Review Diffs

Generate reviewable proposed canon updates and allow the user to approve, edit, or reject them.

## Phase 11: Durable SQLite Storage

Implement durable SQLite read/write, migrations, full-text context retrieval, backup export, and
safe file selection through browser-compatible local file APIs.

## Phase 12: Campaign Bundle Export

Export complete campaign bundles with structured state, notes, templates, imported responses,
reviewed diffs, and attachments or references.
