const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question(`What is your name? `, (username: string) => {
  const reversedName = username.split('').reverse().join('');
  console.log(`Your name in reverse is: ${reversedName}`);
  readline.close();
});