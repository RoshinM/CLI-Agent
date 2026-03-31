import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter something: ', (input: string) => {
  console.log(input);
  rl.close();
});