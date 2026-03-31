import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

interface UserDetails {
    name: string;
    age: number;
    email: string;
}

const user: Partial<UserDetails> = {};

rl.question('Enter your name: ', (name) => {
    user.name = name;
    rl.question('Enter your age: ', (ageStr) => {
        const age = parseInt(ageStr, 10);
        if (isNaN(age)) {
            console.log('Invalid age entered. Setting age to 0.');
            user.age = 0;
        } else {
            user.age = age;
        }
        rl.question('Enter your email: ', (email) => {
            user.email = email;
            console.log(`\nUser Details:\nName: ${user.name}\nAge: ${user.age}\nEmail: ${user.email}`);
            rl.close();
        });
    });
});