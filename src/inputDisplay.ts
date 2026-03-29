import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Enter something: ", (answer) => {
  const normalized = answer.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  const reversed = normalized.split("").reverse().join("");

  if (normalized === reversed) {
    console.log("The input is a palindrome.");
  } else {
    console.log("The input is not a palindrome.");
  }

  // Close the readline interface
  rl.close();
});
