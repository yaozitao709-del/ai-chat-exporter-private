declare module "@hungknguyen/mathml2omml" {
  export function mml2omml(mathMl: string, options?: { disableDecode?: boolean }): string;
}
