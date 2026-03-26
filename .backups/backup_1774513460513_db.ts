type ID = number;

class Student {
 constructor(public id: ID, public name: string) {}
}

class Teacher {
 constructor(public id: ID, public name: string) {}
}

class ClassRoom {
 public students: Student[] = [];
 public teachers: Teacher[] = [];

 constructor(public id: ID, public name: string) {}

 addStudent(student: Student) {
 this.students.push(student);
 }

 addTeacher(teacher: Teacher) {
 this.teachers.push(teacher);
 }
}

class Database {
 private students: Map<ID, Student> = new Map();
 private teachers: Map<ID, Teacher> = new Map();
 private classes: Map<ID, ClassRoom> = new Map();

 addStudent(id: ID, name: string) {
 const student = new Student(id, name);
 this.students.set(id, student);
 }

 addTeacher(id: ID, name: string) {
 const teacher = new Teacher(id, name);
 this.teachers.set(id, teacher);
 }

 addClass(id: ID, name: string) {
 const cls = new ClassRoom(id, name);
 this.classes.set(id, cls);
 }

 assignStudentToClass(studentId: ID, classId: ID) {
 const student = this.students.get(studentId);
 const cls = this.classes.get(classId);

 if (!student || !cls) {
 console.log("Invalid student or class ID");
 return;
 }

 cls.addStudent(student);
 }

 assignTeacherToClass(teacherId: ID, classId: ID) {
 const teacher = this.teachers.get(teacherId);
 const cls = this.classes.get(classId);

 if (!teacher || !cls) {
 console.log("Invalid teacher or class ID");
 return;
 }

 cls.addTeacher(teacher);
 }

 printData() {
 for (const cls of this.classes.values()) {
 console.log(`Class: ${cls.name}`);
 console.log(" Teachers:");
 cls.teachers.forEach(t => console.log(`- ${t.name}`));
 console.log(" Students:");
 cls.students.forEach(s => console.log(`- ${s.name}`));
 console.log("-----------------");
 }
 }
}

// Example usage
const db = new Database();

db.addStudent(1, "Alice");
db.addStudent(2, "Bob");

db.addTeacher(1, "Mr. Smith");

db.addClass(1, "Math");

db.assignStudentToClass(1, 1);
db.assignStudentToClass(2, 1);
db.assignTeacherToClass(1, 1);

db.printData();