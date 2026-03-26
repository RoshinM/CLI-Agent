import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Enter the first number: ', (first) => {
    rl.question('Enter an operator (+, -, *, /): ', (operator) => {
        rl.question('Enter the second number: ', (second) => {
            const num1 = parseFloat(first);
            const num2 = parseFloat(second);
            let result: number;

            switch(operator) {
                case '+':
                    result = num1 + num2;
                    break;
                case '-':
                    result = num1 - num2;
                    break;
                case '*':
                    result = num1 * num2;
                    break;
                case '/':
                    if (num2 === 0) {
                        console.log('Error: Division by zero');
                        rl.close();
                        return;
                    }
                    result = num1 / num2;
                    break;
                default:
                    console.log('Invalid operator');
                    rl.close();
                    return;
            }

            console.log(`The result is: ${result}`);
            rl.close();
        });
    });
});