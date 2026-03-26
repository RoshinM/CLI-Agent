import * as readline from "readline";

const rl = readline.createInterface({ // creates a readline interface to handle input and output via the command line
  input: process.stdin,
  output: process.stdout
});

rl.question("Choose operation (+, -, *, /): ", (op) => {
  rl.question("Enter first number: ", (num1) => {
    rl.question("Enter second number: ", (num2) => {
      const a = Number(num1);
      const b = Number(num2);
      let result: number;

      switch (op) {
        case '+':
          result = a + b;
          break;
        case '-':
          result = a - b;
          break;
        case '*':
          result = a * b;
          break;
        case '/':
          if (b === 0) {
            console.log("Error: Division by zero");
            rl.close();
            return;
          }
          result = a / b;
          break;
        default:
          console.log("Invalid operation");
          rl.close();
          return;
      }

      console.log("Result:", result); // outputs the result of the chosen arithmetic operation
      rl.close();
    });
  });
});