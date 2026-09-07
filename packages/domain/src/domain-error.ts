export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 422,
    message?: string,
  ) {
    super(message ?? code);
  }
}
