import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Enter the first number: ', (first) => {
    rl.question('Enter the second number: ', (second) => {
        const num1 = parseFloat(first);
        const num2 = parseFloat(second);
        const sum = num1 + num2;
        console.log(`The sum is: ${sum}`);
        rl.close();
    });
});