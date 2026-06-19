export function providerResultMeta(result) {
  return result
    ? `Ollama ${result.model}; ${Math.round((result.durationMs ?? 0) / 1000)}s; context ${result.contextSize ?? 0} chars`
    : "";
}

export function contractIssueFromProviderResult(result) {
  if (!result) {
    return "missing provider result";
  }
  if (result.ok === true && !result.error && !result.parseError) {
    return "";
  }
  if (result.parseError) {
    return result.parseError;
  }
  if (Array.isArray(result.validationErrors) && result.validationErrors.length) {
    return result.validationErrors[0];
  }
  return "";
}
