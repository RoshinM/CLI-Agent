const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Please enter your input: ', (answer: string) => {
  console.log(`You entered: ${answer}`);
  rl.close();
});