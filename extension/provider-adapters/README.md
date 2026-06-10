# Provider Adapters

Provider adapters are isolated because provider DOMs change.

The first adapter target is ChatGPT in a logged-in Firefox tab. The extension sidebar communicates
with the adapter through the background script using tab-scoped messages.
