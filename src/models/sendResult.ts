export type SendResult = {
  seller: string;
  recipient: string;
  status?: number;
  data?: unknown;
  error?: string;
};