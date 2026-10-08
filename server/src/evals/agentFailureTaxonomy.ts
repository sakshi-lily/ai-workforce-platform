export enum AgentFailureType {
  PLANNING_FAILURE = "PLANNING_FAILURE",
  TOOL_SELECTION_FAILURE = "TOOL_SELECTION_FAILURE",
  ARGUMENT_VALIDATION_FAILURE = "ARGUMENT_VALIDATION_FAILURE",
  TOOL_EXECUTION_FAILURE = "TOOL_EXECUTION_FAILURE",
  CONTEXT_FAILURE = "CONTEXT_FAILURE",
  RETRIEVAL_FAILURE = "RETRIEVAL_FAILURE",
  GROUNDING_FAILURE = "GROUNDING_FAILURE",
  SYNTHESIS_FAILURE = "SYNTHESIS_FAILURE",
  TIMEOUT = "TIMEOUT",
  WATCHDOG_TERMINATION = "WATCHDOG_TERMINATION",
  AUTHORIZATION_FAILURE = "AUTHORIZATION_FAILURE",
  POLICY_FAILURE = "POLICY_FAILURE",
  UNKNOWN_FAILURE = "UNKNOWN_FAILURE",
}

export interface ClassifiedAgentFailure {
  type: AgentFailureType;
  message: string;
  recoverable: boolean;
  suggestedMitigation: string;
}

export function classifyAgentFailure(error: unknown): ClassifiedAgentFailure {
  const errMsg = error instanceof Error ? error.message : String(error);
  const lower = errMsg.toLowerCase();

  if (lower.includes("plan") || lower.includes("decompose") || lower.includes("dag")) {
    return {
      type: AgentFailureType.PLANNING_FAILURE,
      message: errMsg,
      recoverable: true,
      suggestedMitigation: "Re-prompt with structured few-shot planning decomposition schema.",
    };
  }

  if (lower.includes("unknown tool") || lower.includes("unregistered tool") || lower.includes("tool selection")) {
    return {
      type: AgentFailureType.TOOL_SELECTION_FAILURE,
      message: errMsg,
      recoverable: false,
      suggestedMitigation: "Filter tool list strictly against registered allowlist.",
    };
  }

  if (lower.includes("validation") || lower.includes("zod") || lower.includes("invalid argument") || lower.includes("schema")) {
    return {
      type: AgentFailureType.ARGUMENT_VALIDATION_FAILURE,
      message: errMsg,
      recoverable: true,
      suggestedMitigation: "Enforce strict Zod argument validation and provide schema feedback to agent.",
    };
  }

  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("exceeded duration")) {
    return {
      type: AgentFailureType.TIMEOUT,
      message: errMsg,
      recoverable: true,
      suggestedMitigation: "Increase step timeout or decompose task into smaller subtasks.",
    };
  }

  if (lower.includes("watchdog") || lower.includes("max cycle") || lower.includes("max tool calls") || lower.includes("runaway")) {
    return {
      type: AgentFailureType.WATCHDOG_TERMINATION,
      message: errMsg,
      recoverable: false,
      suggestedMitigation: "Ceiling reached: abort runaway loop to protect budget and prevent infinite iteration.",
    };
  }

  if (lower.includes("grounding") || lower.includes("hallucination") || lower.includes("citation missing")) {
    return {
      type: AgentFailureType.GROUNDING_FAILURE,
      message: errMsg,
      recoverable: true,
      suggestedMitigation: "Re-prompt with explicit instruction to cite only retrieved source tokens [S1..Sn].",
    };
  }

  if (lower.includes("unauthorized") || lower.includes("forbidden") || lower.includes("cross-tenant") || lower.includes("tenant")) {
    return {
      type: AgentFailureType.AUTHORIZATION_FAILURE,
      message: errMsg,
      recoverable: false,
      suggestedMitigation: "Enforce tenant boundaries and block cross-tenant IDOR access.",
    };
  }

  if (lower.includes("policy") || lower.includes("approval required") || lower.includes("side effect blocked")) {
    return {
      type: AgentFailureType.POLICY_FAILURE,
      message: errMsg,
      recoverable: true,
      suggestedMitigation: "Transition task to WAITING_FOR_APPROVAL and request human authorization.",
    };
  }

  if (lower.includes("retrieval") || lower.includes("qdrant") || lower.includes("embedding")) {
    return {
      type: AgentFailureType.RETRIEVAL_FAILURE,
      message: errMsg,
      recoverable: true,
      suggestedMitigation: "Retry retrieval with query expansion or fallback to semantic cache.",
    };
  }

  if (lower.includes("tool execution") || lower.includes("executing tool")) {
    return {
      type: AgentFailureType.TOOL_EXECUTION_FAILURE,
      message: errMsg,
      recoverable: true,
      suggestedMitigation: "Wrap tool execution with exponential backoff retry.",
    };
  }

  return {
    type: AgentFailureType.UNKNOWN_FAILURE,
    message: errMsg,
    recoverable: false,
    suggestedMitigation: "Inspect structured logs and stack trace for unclassified exception.",
  };
}
