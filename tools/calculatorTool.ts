export default function calculatorTool(expr: string): string {
  try {
    return eval(expr).toString();
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}