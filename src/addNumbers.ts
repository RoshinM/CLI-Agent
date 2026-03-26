import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Enter the first number: ', (first) => {
    rl.question('Enter an operator (+, -, *, /): ', (operator) => {
        rl.question('Enter the second number: ', (second) => {
            try {
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
                            throw new Error('Division by zero');
                        }
                        result = num1 / num2;
                        break;
                    default:
                        throw new Error('Invalid operator');
                }

                console.log(`The result is: ${result}`);
            } catch (error: any) {
                console.log(`An error occurred: ${error.message}`);
            } finally {
                rl.close();
            }
        });
    });
});