
import readline from 'readline';

// Creating readline interface to handle user input from console
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Helper function to wrap rl.question in a Promise for async/await usage
const askQuestion = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
};

// Main async function to execute user-selected operation
(async () => {
    try {
        // Prompting user to choose an operation
        // add, subtract, multiply, divide require two numbers
        // square, cube, sqrt, cbrt require one number
        const operation = await askQuestion('Choose operation (add, subtract, multiply, divide, square, cube, sqrt, cbrt): ');

        let num1: number, num2: number, result: number;

        // Handle operations that require two numbers
        if (['add', 'subtract', 'multiply', 'divide'].includes(operation)) {
            // Prompting for the first and second numbers
            num1 = parseFloat(await askQuestion('Enter first number: '));
            num2 = parseFloat(await askQuestion('Enter second number: '));

            // Performing the selected arithmetic operation
            switch (operation) {
                case 'add':
                    result = num1 + num2;
                    break;
                case 'subtract':
                    result = num1 - num2;
                    break;
                case 'multiply':
                    result = num1 * num2;
                    break;
                case 'divide':
                    if (num2 === 0) {
                        throw new Error('Cannot divide by zero');
                    }
                    result = num1 / num2;
                    break;
                default:
                    throw new Error('Invalid operation');
            }
        } 
        // Handle operations that require a single number
        else if (['square', 'cube', 'sqrt', 'cbrt'].includes(operation)) {
            // Prompting for one number
            num1 = parseFloat(await askQuestion('Enter a number: '));

            // Performing the selected single-number operation
            switch (operation) {
                case 'square':
                    result = Math.pow(num1, 2);
                    break;
                case 'cube':
                    result = Math.pow(num1, 3);
                    break;
                case 'sqrt':
                    result = Math.sqrt(num1);
                    break;
                case 'cbrt':
                    result = Math.cbrt(num1);
                    break;
                default:
                    throw new Error('Invalid operation');
            }
        } else {
            // Handle unsupported operations
            throw new Error('Unsupported operation');
        }

        // Displaying the result to the user
        console.log(`Result: ${result}`);
    } catch (error: any) {
        // Catching and displaying any errors that occur during input or calculation
        console.error('An error occurred:', error.message);
    } finally {
        // Closing the readline interface to end the program
        rl.close();
    }
})();