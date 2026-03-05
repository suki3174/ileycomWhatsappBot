/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FlowRequest {
  action?: string;
  screen?: string;
  data?: Record<string, any>;
  flow_token?: string;
  version?: string;
}