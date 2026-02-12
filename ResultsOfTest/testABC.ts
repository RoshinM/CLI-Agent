const greet = (name: string): string => {
  return "Hello, " + name + "!";
};

const numbers: number[] = [1, 2, 3, 4, 5];
const sum = numbers.reduce((a, b) => a + b, 0);

console.log(greet("TypeScript"));
console.log("Numbers:", numbers);
console.log("Sum:", sum);