import {
  ContextAssembleRequest,
  ContextAssembledResult,
} from "./types";
import { ContextBuilder } from "./contextBuilder";

/**
 * Phase 28: Context Service
 * Top-level facade for Context Engineering, token optimization, and safe assembly.
 */
export class ContextService {
  /**
   * Assembles governed context for a task, user, and worker role.
   */
  public static async assembleContext(
    request: ContextAssembleRequest
  ): Promise<ContextAssembledResult> {
    return await ContextBuilder.assemble(request);
  }
}
