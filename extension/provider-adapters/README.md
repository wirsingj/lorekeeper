# Provider Adapters

Provider adapters are isolated because provider DOMs change.

The first adapter target is ChatGPT in a logged-in Firefox tab. The local Lorekeeper app communicates
with the adapter through the headless extension background script using tab-scoped messages.
