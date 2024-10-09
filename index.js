import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import bcrypt from "bcrypt";
import fileUpload from "express-fileupload";
import unidecode from "unidecode";

const app = express();
const port = 3000;
const saltRound = 10;
env.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(fileUpload());

app.use(
  session({
    secret: "USERLOGIN",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DATABASE,
  port: process.env.POSTGRES_PORT,
});

db.connect();

//Fetching Database's tables:
//Current user:
async function fetchCurrentUser(id) {
  try {
    const user = await db.query(
      "SELECT *, TO_CHAR(birthday, 'YYYY-MM-DD') AS year FROM users WHERE id = $1",
      [id]
    );

    return user.rows[0];
  } catch (err) {
    console.log(err.message);
  }
}

async function fetchCurrentDepartment(id) {
  const userCurrentDep = await db.query(
    `SELECT d.id AS department_id, d.department_name, u.fname, u.role
    FROM department_members dm
    JOIN departments AS d ON d.id = dm.department_id
    JOIN users AS u ON u.id = dm.user_id
    WHERE u.id = $1`,
    [id]
  );

  return userCurrentDep.rows;
}

//PROJECTS TABLE:
async function fetchProjects() {
  const projects = await db.query(
    `SELECT *, TO_CHAR(project_assigned, 'DD-MM-YYYY') as year 
    FROM projects`
  );

  return projects.rows;
}

//EMPLOYEES TABLE:
async function fetchEmployees() {
  const employees = await db.query(
    "SELECT *, TO_CHAR(birthday, 'YYYY-MM-DD') as birthdate FROM users"
  );

  return employees.rows;
}

async function employeeInDepartment(id) {
  const empList = await db.query(
    `SELECT d.id AS department_id, d.department_name, u.id as user_id, u.fname, u.role, u.phone
   FROM department_members dm
   JOIN departments AS d ON d.id = dm.department_id
   JOIN users AS u ON u.id = dm.user_id
   WHERE d.id = $1`,
    [id]
  );

  return empList.rows;
}

//DEPARTMENTS TABLE:
async function fetchDepartments() {
  const departments = await db.query(
    "SELECT *, TO_CHAR(department_create, 'DD-MM-YYYY') as created FROM departments"
  );

  return departments.rows;
}

//CLIENTS TABLE:
async function fetchClients() {
  const clients = await db.query("SELECT * FROM clients");

  return clients.rows;
}

//TRACKING SPECIFIC USER LEAVE DAYS:
async function currentUserLeaves(id) {
  const leaves = await db.query(
    `SELECT l.id, u.fname, l.vacation_day, l.sick_day 
    FROM leaves l
    JOIN users AS u ON u.id = l.user_id
    WHERE u.id = $1`,
    [id]
  );

  return leaves.rows[0];
}

//Tracking members of projects:
async function projectMembers() {
  const members = await db.query(
    `SELECT p.id, p.project_name, u.fname, u.id as user_id
    FROM project_members pm
    JOIN projects AS p ON p.id = pm.project_id
    JOIN users as u ON u.id = pm.user_id`
  );

  return members.rows;
}

async function userInProject(userId) {
  const projects = await db.query(
    `SELECT p.id, p.project_name, u.fname
    FROM project_members pm
    JOIN projects AS p ON p.id = pm.project_id
    JOIN users as u ON u.id = pm.user_id
    WHERE u.id = $1`,
    [userId]
  );

  return projects.rows;
}

//TODOS TABLE from specify user
async function todosOfUser(userID) {
  const todos = await db.query(
    `SELECT id, todo_title, todo_text, TO_CHAR(todo_assigned, 'DD-MM-YYYY') as date
    FROM todos t
    WHERE user_id = $1
    ORDER BY id DESC`,
    [userID]
  );

  return todos.rows;
}

//USER-LEAVE TABLE:
async function userLeaves(id) {
  const leaveList = await db.query(
    `SELECT * 
    FROM user_leaves
    WHERE id = $1`,
    [id]
  );

  return leaveList.rows[0];
}

async function taskList(userId) {
  try {
    const tasks = await db.query(
      `SELECT 
        t.id, t.task_title, t.task_description, TO_CHAR(t.task_create, 'DD-MM-YYYY') as task_create,
	      t.user_read, t.task_priority, u1.fname as from_user, u1.id as from_user_id, u2.fname as to_user, u2.id as to_user_id  
      FROM tasks t
      JOIN users AS u1 ON u1.id = t.from_user_id
      JOIN users AS u2 ON u2.id = t.to_user_id
      WHERE u2.id = $1
      ORDER BY t.id ASC`,
      [userId]
    );

    return tasks.rows;
  } catch (err) {
    console.log(err.message);
  }
}

//Client Review data:
async function clientReviewData(depId) {
  const data = await db.query(
    `
    SELECT 
      d.department_name,
      to_char(p.project_assigned, 'YYYY-MM') AS month,
      avg(p.project_overview) AS overview
    FROM projects p
    JOIN departments AS d ON d.id = p.department_id
    WHERE d.id = $1
    GROUP BY 
      d.department_name, to_char(p.project_assigned, 'YYYY-MM')
    ORDER BY to_char(p.project_assigned, 'YYYY-MM') ASC
    `,
    [depId]
  );

  return data.rows;
}

//Employee image:
async function employeeAvartar() {
  const employeeAvarata = await db.query("SELECT * FROM user_image");

  return employeeAvarata.rows;
}

//REPORTs TABLE:
async function fetchReports() {
  const reports = await db.query(
    "SELECT *, TO_CHAR(report_create_day, 'YYYY-MM-DD') as create_day FROM reports"
  );

  return reports.rows;
}

//=========================== GET REQUEST ROUTES: ===========================

//ROOT ROUTE:
app.get("/", async (req, res) => {
  res.render("login.ejs");
});

app.get("/logout", async (req, res) => {
  req.logout((err) => {
    if (err) console.log(err);
    res.redirect("/");
  });
});

//DASHBOARD:
app.get("/dashboard", async (req, res) => {
  if (req.isAuthenticated()) {
    //Fetching data from DB:

    const user = req.user; //Get current User

    const userLeaves = await currentUserLeaves(user.id); //Get user leaves
    const userDepartment = await fetchCurrentDepartment(user.id); //Get current user department

    const projects = await fetchProjects(); //Get user projects in

    const employees = await fetchEmployees(); //Get All employee in the same department

    const departments = await fetchDepartments(); // Get Department

    const avartars = await employeeAvartar();

    //Checking user role to render specific dashboard page
    if (user.role === "CEO" || user.role === "ADMIN") {
      //fetching datas from table:
      const clients = await fetchClients(); //Get clients list
      const members = await projectMembers(); // Get project's member list

      res.render("admin.ejs", {
        user,
        projects,
        employees,
        departments,
        clients,
        leaves: userLeaves,
        members,
        avartars,
      });
    } else if (user.role === "Manager") {
      const empList = await employeeInDepartment(
        userDepartment[0].department_id
      );

      const projectOfDeps = projects.filter(
        (project) => project.department_id === userDepartment[0].department_id
      );

      const todos = await todosOfUser(user.id);

      res.render("manager.ejs", {
        user,
        department: userDepartment[0].department_name,
        leaves: userLeaves,
        empList,
        todos,
        projects: projectOfDeps,
        avartars,
      });
    } else {
      const tasks = await taskList(user.id);

      const projectOfDeps = projects.filter(
        (project) => project.department_id === userDepartment[0].department_id
      );

      const workers = await employeeInDepartment(
        userDepartment[0].department_id
      );

      const data = await clientReviewData(userDepartment[0].department_id);
      res.render("employee.ejs", {
        user,
        tasks,
        workers,
        projects: projectOfDeps,
        department: userDepartment[0].department_name,
        leaves: userLeaves,
        avartars,
        data,
      });
    }
  } else {
    res.redirect("/");
  }
});

async function managerTasks(userId) {
  const tasks = await db.query(
    `SELECT 
        t.id, t.task_title, t.task_description, TO_CHAR(t.task_create, 'DD-MM-YYYY') as task_create,
	      t.user_read, t.task_priority, u1.fname as from_user, u1.id as from_user_id, u2.fname as to_user, u2.id as to_user_id  
      FROM tasks t
      JOIN users AS u1 ON u1.id = t.from_user_id
      JOIN users AS u2 ON u2.id = t.to_user_id
      WHERE u1.id = $1
      ORDER BY t.id ASC`,
    [userId]
  );

  return tasks.rows;
}

//TASKS:
app.get("/tasks", async (req, res) => {
  if (req.isAuthenticated()) {
    //Get current user login:
    const user = req.user;

    //Fetching avartar for users:
    const avartars = await employeeAvartar();

    if (user.role === "Manager") {
      const tasks = await managerTasks(user.id);

      res.render("task-list.ejs", {
        user,
        tasks,
        avartars,
      });
    } else {
      const tasks = await taskList(user.id);

      res.render("task-list.ejs", {
        user,
        tasks,
        avartars,
      });
    }
  } else {
    res.redirect("/");
  }
});

async function getSpecifyTask(taskId) {
  const task = await db.query(
    `SELECT 
      t.id, t.task_title, t.task_description, TO_CHAR(t.task_create, 'DD-MM-YYYY') as task_create,
      t.user_read, t.task_priority, u1.id as from_user_id, u1.fname as from_user, u1.role , u2.fname as to_user, u2.id as to_user_id
    FROM tasks t
    JOIN users AS u1 ON u1.id = t.from_user_id
    JOIN users AS u2 ON u2.id = t.to_user_id
    WHERE t.id = $1`,
    [taskId]
  );

  return task.rows[0];
}

app.get("/task/view", async (req, res) => {
  if (req.isAuthenticated()) {
    const id = parseInt(req.query.id);

    const user = req.user;

    const avartars = await employeeAvartar();

    try {
      const task = await getSpecifyTask(id);

      const avartar = avartars.find(
        (avartar) => avartar.user_id === task.from_user_id
      );

      const imageBuffer = Buffer.from(avartar.image_file).toString("base64");

      //Check the user recieved the task:
      if (task.to_user_id === user.id) {
        //SET user readed:
        await db.query(
          `UPDATE tasks
      SET user_read = true
      WHERE id = $1
      `,
          [id]
        );
      }

      res.render("task-review.ejs", {
        taskHeading: false,
        task,
        avartar: imageBuffer,
        user,
      });
    } catch (err) {
      console.log(err.message);
    }
  } else {
    res.redirect("/");
  }
});

app.get("/task/create", async (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user;

    const userDepartment = await fetchCurrentDepartment(user.id);

    const projectMember = await projectMembers();

    const empList = await employeeInDepartment(userDepartment[0].department_id);

    const avartars = await employeeAvartar();

    res.render("task-config.ejs", {
      user,
      projectMember,
      departmentId: userDepartment[0].department_id,
      empList,
      avartars,
    });
  } else {
    res.redirect("/");
  }
});

//REPORT ROUTE:
app.get("/reports", async (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user;

    const reports = await fetchReports();

    //user's reports:

    if (
      user.role === "Manager" ||
      user.role === "CEO" ||
      user.role === "ADMIN"
    ) {
      const userCurrentDep = await fetchCurrentDepartment(user.id);

      const reportFromDeps = reports.filter(
        (report) => report.department_id === userCurrentDep[0].department_id
      );

      const userAvartars = await employeeAvartar();

      res.render("report-list.ejs", {
        user,
        reports: reportFromDeps,
        avartars: userAvartars,
      });
    } else {
      const userReports = reports.filter(
        (report) => report.user_id === user.id
      );

      res.render("report-create.ejs", {
        user,
        reports: userReports,
      });
    }
  } else {
    res.redirect("/");
  }
});

//VIEW REPORT:
app.get("/reports/view", async (req, res) => {
  if (req.isAuthenticated()) {
    //Get reportId to render report's infos:
    const reportId = parseInt(req.query.reportId);

    //Fetch user id for aside:
    const user = await fetchCurrentUser(5);

    //Fetching employee to get report's user_id:
    const employees = await fetchEmployees();

    //fetch reports from database:
    const reports = await fetchReports();

    const report = reports.find((report) => report.id === reportId);

    //convert report file to base64 to download in html:
    const fileData = report.report_file;

    const fileType = "application/octet-stream";

    const base64File = Buffer.from(fileData).toString("base64");

    //fetching user Avartar:
    const avartars = await employeeAvartar();

    const userAvartar = avartars.find(
      (avartar) => avartar.user_id === report.user_id
    );

    let imageBuffer;

    //checking the user-avartar is exist:
    if (userAvartar) {
      imageBuffer = Buffer.from(userAvartar.image_file).toString("base64");
    }

    res.render("report-review.ejs", {
      user,
      report,
      fileType,
      base64File,
      employees,
      imageBuffer,
    });
  } else {
    res.redirect("/");
  }
});

//DELETE REPORT:
app.get("/reports/delete", async (req, res) => {
  const reportId = parseInt(req.query.reportId);

  await db.query(
    `DELETE FROM reports
    where id = $1`,
    [reportId]
  );

  res.redirect("/reports");
});

async function departmentMembers() {
  const members = await db.query(
    `
    SELECT 
    d.id AS department_id, d.department_name, u.id as member_id, u.fname, u.role
    FROM department_members dm
    JOIN departments AS d ON d.id = dm.department_id
    JOIN users AS u ON u.id = dm.user_id
    `
  );

  return members.rows;
}

//DEPARTMENTS ROUTE:
app.get("/departments", async (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user;

    const departments = await fetchDepartments();

    const depsMembers = await departmentMembers();

    const avartars = await employeeAvartar();

    res.render("department-list.ejs", {
      user,
      departments,
      depsMembers,
      avartars,
    });
  } else {
    res.redirect("/");
  }
});

app.get("/departments/detail", async (req, res) => {
  if (req.isAuthenticated()) {
    //Department's ID from get request query:
    const depId = parseInt(req.query.department_id);

    //Fetching data from Database
    const user = req.user;

    const users = await fetchEmployees();

    const departments = await fetchDepartments();

    const projects = await fetchProjects();

    const depsMembers = await departmentMembers();

    const avartars = await employeeAvartar();

    //Get department infos:
    const department = departments.find((dep) => dep.id === depId);

    //Get manager name:
    let managerName;

    //From users get from DB get the manager name from department manager ID:

    for (let user of users) {
      user.id === department.manager_id ? (managerName = user.fname) : null;
    }

    //Count project of department contains:
    const depsProjects = projects.filter(
      (project) => project.department_id === depId
    );

    //Get members from department:
    const members = depsMembers.filter(
      (member) => member.department_id === depId
    );

    //Get data for client's overview:
    const data = await clientReviewData(depId);

    res.render("department-view.ejs", {
      user,
      department,
      managerName,
      members,
      depsProjects,
      data,
      avartars,
    });
  } else {
    res.redirect("/");
  }
});

//PROJECTS:
app.get("/projects", async (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user;

    const userCurrentDep = await fetchCurrentDepartment(user.id);

    const projects = await fetchProjects();

    const members = await projectMembers();

    const avartars = await employeeAvartar();

    //Get all projects from specify dep's ID:
    const projectsOfDeps = projects.filter(
      (project) => project.department_id === userCurrentDep[0].department_id
    );

    res.render("project-list.ejs", {
      user,
      projects: projectsOfDeps,
      members,
      avartars,
    });
  } else {
    res.redirect("/");
  }
});

//PROJECT CREATE ROUTE:
app.get("/projects/create", async (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user;

    const currentUserDeps = await fetchCurrentDepartment(user.id);

    const fetchDepsMembers = await departmentMembers();

    //Get member from project
    const depsMembers = fetchDepsMembers.filter(
      (depMember) =>
        depMember.department_id === currentUserDeps[0].department_id
    );

    res.render("project-config.ejs", {
      user,
      depsMembers,
      postAction: "/projects/create",
    });
  } else {
    res.redirect("/");
  }
});

//PROJECT CONFIG ROUTE:
app.get("/projects/config", async (req, res) => {
  if (req.isAuthenticated()) {
    //Get project's ID from request query:
    const projectId = parseInt(req.query.id);

    const user = req.user;

    const projects = await fetchProjects();

    const getClients = await fetchClients();

    const getMemberInProject = await projectMembers();

    const fetchDepsMembers = await departmentMembers();

    //Get project by id:
    const project = projects.find((project) => project.id === projectId);
    //Get project members:

    //Get client from project:
    const clientInfo = getClients.find(
      (client) => client.id === project.client_id
    );

    //Get Member in project:
    const projMembers = getMemberInProject.filter(
      (projMember) => projMember.id === project.id
    );

    //Get member from project
    const depsMembers = fetchDepsMembers.filter(
      (depMember) => depMember.department_id === project.department_id
    );

    res.render("project-config.ejs", {
      user,
      project,
      clientInfo,
      projMembers,
      depsMembers,
      postAction: "/projects/edit",
    });
  } else {
    res.redirect("/");
  }
});

//EMPLOYEES
app.get("/employees", async (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user;
    const employees = await fetchEmployees();
    const departments = await departmentMembers();
    const avartars = await employeeAvartar();

    if (user.role === "CEO" || user.role === "ADMIN") {
      res.render("employee-list.ejs", {
        user,
        employees,
        departments,
        avartars,
      });
    } else {
      res.render("employee-list.ejs", {
        user,
        employees,
        departments,
        avartars,
      });
    }
  } else {
    res.redirect("/");
  }
});

//Create employee route:
app.get("/employees/create", async (req, res) => {
  const user = req.user;
  const departments = await fetchDepartments();

  res.render("employee-config.ejs", {
    heading: "Create Employee",
    user,
    actionRoute: "/employees/create",
  });
});

//Edit Employee Route:
app.get("/employees/edit", async (req, res) => {
  const empID = parseInt(req.query.id);

  const user = req.user;

  const employees = await fetchEmployees();

  const departments = await fetchDepartments();

  //get editing employee by id:
  const currentEmp = employees.find((emp) => emp.id === empID);

  res.render("employee-config.ejs", {
    heading: "Edit Employee",
    user,
    emp: currentEmp,
    departments,
    actionRoute: "/employees/edit",
  });
});

//ACCOUNT DETAILS:
app.get("/details", async (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user;

    const userAvartars = await employeeAvartar();

    const avarta = userAvartars.find((avarta) => avarta.user_id === user.id);

    const currentUserDep = await fetchCurrentDepartment(user.id);

    const imageBuffer = Buffer.from(avarta.image_file).toString("base64");

    res.render("account-details.ejs", {
      user,
      department: currentUserDep[0],
      avartar: imageBuffer,
    });
  } else {
    res.redirect("/");
  }
});

//REQUEST LEAVES ROUTE:
app.get("/request-leave", async (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user;

    const avartars = await employeeAvartar();

    try {
      const leaves = await db.query(
        `
      SELECT ul.id, u.id as user_id, u.fname, TO_CHAR(leave_day, 'DD-MM-YYYY') as date, leave_reason, leave_accept
      FROM user_leaves ul
      JOIN leaves AS l ON l.id = ul.leave_id
      JOIN users AS u ON u.id = ul.user_id
      `
      );

      if (user.role === "CEO" || user.role === "ADMIN") {
        res.render("request-leave-list.ejs", {
          user,
          leaves: leaves.rows,
          avartars,
        });
      } else {
        const currentUserLeave = leaves.rows.filter(
          (leave) => leave.user_id === user.id
        );

        res.render("request-leave-list.ejs", {
          user,
          leaves: currentUserLeave,
          avartars,
        });
      }
    } catch (err) {
      console.log(err.message);
    }
  } else {
    res.redirect("/");
  }
});

//=========================== POST REQUEST ROUTES: //===========================
//LOGIN:
app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/dashboard",
    failureRedirect: "/",
  })
);

//MANAGER-TODO:
//TODO-CREATE
app.post("/todo/create", async (req, res) => {
  const userId = parseInt(req.body.user_id);
  const { todo_title, todo_text } = req.body;

  try {
    await db.query(
      `INSERT INTO todos (todo_title, todo_text, todo_assigned, user_id)
      VALUES ($1, $2, $3, $4)`,
      [todo_title, todo_text, new Date(), userId]
    );

    res.redirect("/dashboard");
  } catch (err) {}
});

//TODO-DELETE:
app.post("/todo/delete", async (req, res) => {
  const todoId = parseInt(req.body.del_id);

  try {
    await db.query(
      `DELETE FROM todos
      WHERE id = $1`,
      [todoId]
    );

    res.redirect("/dashboard");
  } catch (err) {}
});

//REQUEST-LEAVE:
app.post("/request-leave", async (req, res) => {
  const user = req.user;
  const { leave_date, leaving_reason, leave_id } = req.body;

  try {
    await db.query(
      `INSERT INTO user_leaves (leave_id, user_id, leave_day, leave_reason)
      VALUES ($1, $2, $3, $4)`,
      [leave_id, user.id, leave_date, leaving_reason]
    );

    res.redirect("/dashboard");
  } catch (err) {
    console.log(err.message);
  }
});

//APPROVE USER LEAVE:
app.post("/request-leave/approve/:id", async (req, res) => {
  const userId = parseInt(req.params.id);
  const requestId = parseInt(req.query.leave_id);

  const leaves = await currentUserLeaves(userId);
  try {
    await db.query(
      `
        UPDATE user_leaves
        SET leave_accept = true
        WHERE id = $1
      `,
      [requestId]
    );

    const userLeave = await userLeaves(requestId);

    if (userLeave.leave_reason === "vacation") {
      await db.query(
        `
        UPDATE leaves
        SET vacation_day = $1
        WHERE id = $2
        `,
        [--leaves.vacation_day, leaves.id]
      );
    } else {
      await db.query(
        `
        UPDATE leaves
        SET sick_day = $1
        WHERE id = $2
        `,
        [--leaves.sick_day, leaves.id]
      );
    }

    res.redirect("/request-leave");
  } catch (err) {
    console.log(err.message);
  }
});

//DECLINE user leave
app.post("/request-leave/decline/:id", async (req, res) => {
  const userId = parseInt(req.params.id);
  const requestId = parseInt(req.query.leave_id);

  const leaves = await currentUserLeaves(userId);

  try {
    await db.query(
      `
        UPDATE user_leaves
        SET leave_accept = false
        WHERE id = $1
      `,
      [requestId]
    );

    const userLeave = await userLeaves(requestId);

    if (userLeave.leave_reason === "vacation") {
      await db.query(
        `
        UPDATE leaves
        SET vacation_day = $1
        WHERE id = $2
        `,
        [++leaves.vacation_day, leaves.id]
      );
    } else {
      await db.query(
        `
        UPDATE leaves
        SET sick_day = $1
        WHERE id = $2
        `,
        [++leaves.sick_day, leaves.id]
      );
    }

    res.redirect("/request-leave");
  } catch (err) {
    console.log(err.message);
  }
});

//CREATE TASK BY MANAGER:
app.post("/task/create", async (req, res) => {
  const { task_title, task_description, from_user, to_user, task_priority } =
    req.body;

  console.log(req.body);

  try {
    await db.query(
      `INSERT INTO tasks
      (task_title, task_description, task_create, from_user_id, to_user_id, task_priority)
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        task_title,
        task_description,
        new Date(),
        from_user,
        to_user,
        task_priority,
      ]
    );

    res.redirect("/tasks");
  } catch (err) {
    console.log(err.message);
  }
});

//DELETE TASK BY MANAGER:
app.post("/task/delete", async (req, res) => {
  //GET TASK ID FROM MANAGER REQUEST:
  const taskId = parseInt(req.body.task_id);

  try {
    await db.query(
      `DELETE FROM tasks
      WHERE id = $1`,
      [taskId]
    );

    res.redirect("/task");
  } catch (err) {
    console.log(err.message);
  }
});

//Project Create route:
app.post("/projects/create", async (req, res) => {
  const user = req.user;

  const userCurrentDep = await fetchCurrentDepartment(user.id);

  const depsID = userCurrentDep[0].department_id;

  //Request body:
  const {
    project_name,
    members,
    budget,
    client_name,
    client_phone,
    client_email,
  } = req.body;

  const employees = await fetchEmployees();

  let memberIdList = [];

  if (Array.isArray(members)) {
    members.forEach((member) => {
      employees.map((employee) => {
        if (employee.fname == member) {
          memberIdList.push(employee.id);
        }
      });
    });
  }

  try {
    //Get client's infos and creating new client then return the client's ID:
    const createClient = await db.query(
      `INSERT INTO clients (client_name, client_phone, client_email)
      VALUES ($1, $2, $3)
      RETURNING *`,
      [client_name, client_phone, client_email]
    );

    // //Creating new project:
    const createProject = await db.query(
      `INSERT INTO projects (project_name, project_budget, project_assigned, client_id, department_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [project_name, budget, new Date(), createClient.rows[0].id, depsID]
    );

    // Implementing members into project by project's id:
    if (memberIdList.length > 0) {
      for (let memberId of memberIdList) {
        await db.query(
          `INSERT INTO project_members (project_id, user_id)
          VALUES ($1, $2)`,
          [createProject.rows[0].id, memberId]
        );
      }
    } else {
      if (members) {
        //Get members is by fname:
        const member = await db.query("SELECT * FROM users WHERE fname = $1", [
          members,
        ]);

        //adding single member into project:
        await db.query(
          `INSERT INTO project_members (project_id, user_id)
          VALUES ($1, $2)`,
          [projID, member.rows[0].id]
        );
      }
    }

    res.redirect("/projects");
  } catch (err) {
    console.log(err.message);
  }
});

app.post("/projects/edit", async (req, res) => {
  const projID = parseInt(req.query.id);

  const user = req.user;

  const { project_name, members, overview, project_progress } = req.body;
  const employees = await fetchEmployees();

  let memberIdList = [];

  if (Array.isArray(members)) {
    members.forEach((member) => {
      employees.map((employee) => {
        if (employee.fname == member) {
          memberIdList.push(employee.id);
        }
      });
    });
  }

  try {
    // Deleting old members in this project:
    await db.query(
      `DELETE FROM project_members
      WHERE project_id = $1`,
      [projID]
    );

    //Checking does form send multiple members:
    if (memberIdList.length > 0) {
      //Adding new members list:
      for (let memberId of memberIdList) {
        await db.query(
          `INSERT INTO project_members (project_id, user_id)
          VALUES ($1, $2)`,
          [projID, memberId]
        );
      }
    } else {
      if (members) {
        //Get members is by fname:
        const member = await db.query("SELECT * FROM users WHERE fname = $1", [
          members,
        ]);

        //adding single member into project:
        await db.query(
          `INSERT INTO project_members (project_id, user_id)
          VALUES ($1, $2)`,
          [projID, member.rows[0].id]
        );
      }
    }

    //Updating some project's name, overview, progress:
    await db.query(
      `UPDATE projects
      SET project_name = $1, project_overview = $2, project_progress = $3
      WHERE id = $4`,
      [project_name, overview, project_progress, projID]
    );

    res.redirect("/projects");
  } catch (err) {
    console.log(err.message);
  }
});

//DELETE PROJECT ROUTE:
app.post("/projects/delete", async (req, res) => {
  //Project's ID from Request body:
  const projID = parseInt(req.body.project_id);

  try {
    //Drop all members in the project:
    await db.query(
      `DELETE FROM project_members
      WHERE project_id = $1`,
      [projID]
    );

    //Drop The project:
    await db.query(
      `DELETE FROM projects
      WHERE id = $1`,
      [projID]
    );

    res.redirect("/projects");
  } catch (err) {
    console.log(err.message);
  }
});

//CREATING NEW EMPLOYEE:
app.post("/employees/create", async (req, res) => {
  const user = req.user;
  const { fname, birthday, email, phone, username, password, repassword } =
    req.body;

  const checkUserExist = await db.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  if (checkUserExist.rows.length > 0) {
    res.render("employee-config.ejs", {
      user,
      errorMessage: "This user already existed!",
    });
  } else {
    //Salting employee's password and adding into database:
    bcrypt.hash(password, saltRound, async (err, hash) => {
      if (err) throw err;

      //Create new user and Returning ID
      const newUser = await db.query(
        `INSERT INTO users (fname, email, phone, birthday, username, password)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [fname, email, phone, birthday, username, hash]
      );

      //Create user leaves:
      await db.query("INSERT INTO leaves (user_id) VALUES ($1)", [
        newUser.rows[0].id,
      ]);

      //Checking the file does exist
      if (!req.files) {
        //Set default null image_file for not image adding:
        await db.query(
          `INSERT INTO user_image (image_name, image_file, user_id)
        VALUES ($1, $2, $3)`,
          [null, null, newUser.rows[0].id]
        );

        res.redirect("/employees");
      } else {
        //Otherwise, adding the image file into DB:
        const userImage = req.files.user_image;

        //Checking the image file MIMETYPE as jpeg or png:
        if (
          userImage.mimetype === "image/jpeg" ||
          userImage.mimetype === "image/png"
        ) {
          await db.query(
            `INSERT INTO user_image (image_name, image_file, user_id)
          VALUES ($1, $2, $3)`,
            [userImage.name, userImage.data, newUser.rows[0].id]
          );

          res.redirect("/employees");
        } else {
          res.redirect("/employees");
        }
      }
    });
  }
});

//UPDATING EMPLOYEE INFORMATION:
app.post("/employees/edit", async (req, res) => {
  //Get employee's ID from request query:
  const empID = parseInt(req.query.id);

  //Request's Body get on form:
  const { fname, birthday, email, phone, username, department, role } =
    req.body;

  try {
    //Update new infos for employee:
    await db.query(
      `UPDATE users 
      SET fname = $1, birthday= $2, email = $3, phone = $4, username = $5, role = $6
      WHERE id = $7`,
      [fname, birthday, email, phone, username, role, empID]
    );

    //Update user image:
    if (req.files) {
      const userImage = req.files.user_image;

      if (
        userImage.mimetype === "image/jpeg" ||
        userImage.mimetype === "image/png"
      ) {
        await db.query(
          `UPDATE user_image
          SET image_file = $1, image_name = $2
          WHERE user_id = $3`,
          [userImage.data, userImage.name, empID]
        );
      }
    }

    //Update new employee's department:
    //Check if employee was join any department:
    const checkEmpDepartment = await fetchCurrentDepartment(empID);

    if (checkEmpDepartment.length > 0) {
      await db.query(
        `UPDATE department_members
        SET department_id = $1
        WHERE user_id = $2`,
        [department, empID]
      );
    } else {
      //Else, the employee is not join, attemp to add employee to new department
      await db.query(
        `INSERT INTO department_members
        VALUES($1, $2)`,
        [department, empID]
      );
    }

    res.redirect("/employees");
  } catch (err) {
    console.log(err.message);
  }
});

//DELETE EMPLOYEE:
app.post("/employees/delete", async (req, res) => {
  const empID = parseInt(req.body.employee_id);

  try {
    await db.query(
      `DELETE FROM users
      WHERE id = $1`,
      [empID]
    );

    res.redirect("/employees");
  } catch (err) {
    console.log(err.message);
  }
});

//ACCOUNT'S PASSWORD CHANGE ROUTE:
app.post("/details/change-password", async (req, res) => {
  const accountID = parseInt(req.query.id);

  const { old_password, password } = req.body;

  const user = await fetchCurrentUser(accountID);

  const userCurrentDep = await fetchCurrentDepartment(user.id);

  const userAvartars = await employeeAvartar();

  //Get user's avartar:
  const avarta = userAvartars.find((avarta) => avarta.user_id === accountID);

  const avartaBuffer = Buffer.from(avarta.image_file).toString("base64");

  // Check user's old-password:
  bcrypt.compare(old_password, user.password, (err, result) => {
    //If true attemp to change user new password:
    if (result) {
      bcrypt.hash(password, saltRound, async (err, hash) => {
        await db.query(
          `UPDATE users
          SET password = $1
          WHERE id = $2`,
          [hash, accountID]
        );
      });

      res.render("account-details.ejs", {
        user,
        department: userCurrentDep[0],
        successMessage: true,
        avartar: avartaBuffer,
      });
    } else {
      res.render("account-details.ejs", {
        user,
        department: userCurrentDep[0],
        errorMessage: true,
        avartar: avartaBuffer,
      });
    }
  });
});

//CREATING NEW REPORTS :
app.post("/reports/create", async (req, res) => {
  const userId = parseInt(req.query.userId);

  const userDepartment = await fetchCurrentDepartment(userId);

  const { report_title, report_description } = req.body;

  try {
    if (!req.files) {
      //throw err
      const user = await fetchCurrentUser(userId);

      res.render("report-create.ejs", {
        user,
        errorMessage: "You are missing a file to send.",
      });
    } else {
      const reportFile = req.files.report_file;

      await db.query(
        `INSERT INTO reports (report_title, report_description, report_file_name, report_file, report_create_day, department_id, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          report_title,
          report_description,
          reportFile.name,
          reportFile.data,
          new Date(),
          userDepartment[0].department_id,
          userId,
        ]
      );

      res.redirect("/reports");
    }
  } catch (err) {
    console.log(err.message);
  }
});

passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE username = $1", [
        username,
      ]);

      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storeHashedPassword = user.password;

        bcrypt.compare(password, storeHashedPassword, (err, result) => {
          if (err) {
            return cb(err);
          } else {
            if (result) {
              return cb(null, user);
            } else {
              return cb(null, false);
            }
          }
        });
      } else {
        return cb("User Not Found!");
      }
    } catch (err) {
      return cb("User Not Found!");
    }
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Listen on port: ${port}`);
});
