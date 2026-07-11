require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function getWorkingDays(start, end) {
  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function generateAttendance(workingDays, targetPct, employeeId) {
  const total = workingDays.length;
  const presentLateTarget = Math.round((targetPct / 100) * total);
  const absentCount = total - presentLateTarget;
  const lateCount = targetPct < 90 ? Math.max(2, Math.round((90 - targetPct) / 5)) : 0;
  const presentCount = presentLateTarget - lateCount;

  const records = workingDays.map((d, i) => {
    let status;
    if (i < presentCount) status = 'present';
    else if (i < presentCount + lateCount) status = 'late';
    else status = 'absent';
    return { date: d.toISOString().split('T')[0], status };
  });

  // Shuffle absent/late/present realistically — spread absences and late throughout
  const shuffled = [...records];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Only shuffle status, not date
    const tmp = shuffled[i].status;
    shuffled[i].status = shuffled[j].status;
    shuffled[j].status = tmp;
  }
  // Keep dates in order
  return workingDays.map((d, i) => ({
    employee_id: employeeId,
    date: d.toISOString().split('T')[0],
    status: shuffled[i].status,
  }));
}

const DEPARTMENTS = [
  { key: 'engineering', label: 'Engineering', manager_name: 'Fahad Mohammed' },
  { key: 'finance', label: 'Finance', manager_name: 'Saad Abdullah' },
  { key: 'itsupport', label: 'IT Support', manager_name: 'Lena Khalid' },
  { key: 'marketing', label: 'Marketing', manager_name: 'Reema Ahmed' },
];

// attendance_pct, tenure_yrs, leave_balance, performance_rating_met, goal_achievement_met,
// leadership_cert, manager_feedback_positive, peer_feedback_positive
const ENGINEERING_EMPLOYEES = [
  { emp_key:'sarah_ahmed', first:'Sarah', last:'Ahmed', role:'Software Engineer', initials:'SA',
    att:97, tenure:4.2, lb:12, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'faisal_mohammed', first:'Faisal', last:'Mohammed', role:'Senior Software Engineer', initials:'FM',
    att:95, tenure:1.3, lb:6, perf:true, goal:true, cert:false, mfb:true, pfb:true },
  { emp_key:'omar_saad', first:'Omar', last:'Saad', role:'Backend Engineer', initials:'OS',
    att:81, tenure:3.6, lb:9, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'lama_khalid', first:'Lama', last:'Khalid', role:'Frontend Engineer', initials:'LK',
    att:93, tenure:2.9, lb:14, perf:true, goal:true, cert:false, mfb:true, pfb:true },
  { emp_key:'turki_fahad', first:'Turki', last:'Fahad', role:'DevOps Engineer', initials:'TF',
    att:98, tenure:5.1, lb:10, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'hessa_nasser', first:'Hessa', last:'Nasser', role:'QA Engineer', initials:'HN',
    att:90, tenure:3.3, lb:7, perf:true, goal:false, cert:true, mfb:false, pfb:true },
  { emp_key:'hassan_sultan', first:'Hassan', last:'Sultan', role:'Data Engineer', initials:'HS',
    att:79, tenure:2.5, lb:15, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'rana_waleed', first:'Rana', last:'Waleed', role:'Mobile Engineer', initials:'RW',
    att:94, tenure:4.7, lb:5, perf:false, goal:true, cert:false, mfb:true, pfb:true },
  { emp_key:'majed_ibrahim', first:'Majed', last:'Ibrahim', role:'Engineering Team Lead', initials:'MI',
    att:96, tenure:6.0, lb:11, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'dana_talal', first:'Dana', last:'Talal', role:'Site Reliability Engineer', initials:'DT',
    att:88, tenure:1.6, lb:8, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'meshal_abdullah', first:'Meshal', last:'Abdullah', role:'Software Engineer II', initials:'MA',
    att:92, tenure:3.1, lb:9, perf:true, goal:true, cert:true, mfb:true, pfb:true },
];

const FINANCE_EMPLOYEES = [
  { emp_key:'layla_mohammed', first:'Layla', last:'Mohammed', role:'Financial Analyst', initials:'LM',
    att:97, tenure:4.2, lb:12, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'yousef_abdullah', first:'Yousef', last:'Abdullah', role:'Senior Financial Analyst', initials:'YA',
    att:95, tenure:1.3, lb:6, perf:true, goal:true, cert:false, mfb:true, pfb:true },
  { emp_key:'noura_ahmed', first:'Noura', last:'Ahmed', role:'Accountant', initials:'NA',
    att:81, tenure:3.6, lb:9, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'bandar_khalid', first:'Bandar', last:'Khalid', role:'Payroll Specialist', initials:'BK',
    att:93, tenure:2.9, lb:14, perf:true, goal:true, cert:false, mfb:true, pfb:true },
  { emp_key:'amal_saad', first:'Amal', last:'Saad', role:'Budget Analyst', initials:'AS',
    att:98, tenure:5.1, lb:10, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'nasser_faisal', first:'Nasser', last:'Faisal', role:'Treasury Analyst', initials:'NF',
    att:90, tenure:3.3, lb:7, perf:true, goal:false, cert:true, mfb:false, pfb:true },
  { emp_key:'wafa_turki', first:'Wafa', last:'Turki', role:'Internal Auditor', initials:'WT',
    att:79, tenure:2.5, lb:15, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'ibrahim_nawaf', first:'Ibrahim', last:'Nawaf', role:'Accounts Payable Specialist', initials:'IN',
    att:94, tenure:4.7, lb:5, perf:false, goal:true, cert:false, mfb:true, pfb:true },
  { emp_key:'munira_hassan', first:'Munira', last:'Hassan', role:'Financial Controller', initials:'MH',
    att:96, tenure:6.0, lb:11, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'saud_majed', first:'Saud', last:'Majed', role:'Senior Accountant', initials:'SM',
    att:88, tenure:1.6, lb:8, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'rayan_mohammed', first:'Rayan', last:'Mohammed', role:'Finance Coordinator', initials:'RM',
    att:91, tenure:2.4, lb:9, perf:true, goal:true, cert:true, mfb:true, pfb:true },
];

const ITSUPPORT_EMPLOYEES = [
  { emp_key:'ahmed_khalid', first:'Ahmed', last:'Khalid', role:'IT Support Specialist', initials:'AK',
    att:97, tenure:4.2, lb:12, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'reem_mohammed', first:'Reem', last:'Mohammed', role:'Help Desk Technician', initials:'RM2',
    att:95, tenure:1.3, lb:6, perf:true, goal:true, cert:false, mfb:true, pfb:true },
  { emp_key:'khalid_sultan', first:'Khalid', last:'Sultan', role:'Systems Administrator', initials:'KS',
    att:81, tenure:3.6, lb:9, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'maha_fahad', first:'Maha', last:'Fahad', role:'Network Support Engineer', initials:'MF',
    att:93, tenure:2.9, lb:14, perf:true, goal:true, cert:false, mfb:true, pfb:true },
  { emp_key:'waleed_saad', first:'Waleed', last:'Saad', role:'IT Support Team Lead', initials:'WS',
    att:98, tenure:5.1, lb:10, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'aisha_turki', first:'Aisha', last:'Turki', role:'Desktop Support Analyst', initials:'AT',
    att:90, tenure:3.3, lb:7, perf:true, goal:false, cert:true, mfb:false, pfb:true },
  { emp_key:'nawaf_hassan', first:'Nawaf', last:'Hassan', role:'IT Security Analyst', initials:'NH',
    att:79, tenure:2.5, lb:15, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'rawan_abdullah', first:'Rawan', last:'Abdullah', role:'Service Desk Coordinator', initials:'RA',
    att:94, tenure:4.7, lb:5, perf:false, goal:true, cert:false, mfb:true, pfb:true },
  { emp_key:'talal_ibrahim', first:'Talal', last:'Ibrahim', role:'Infrastructure Technician', initials:'TI',
    att:96, tenure:6.0, lb:11, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'alanoud_majed', first:'Alanoud', last:'Majed', role:'IT Support Engineer', initials:'AM',
    att:88, tenure:1.6, lb:8, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'sadeem_ahmed', first:'Sadeem', last:'Ahmed', role:'IT Operations Analyst', initials:'SA2',
    att:93, tenure:2.8, lb:10, perf:true, goal:true, cert:true, mfb:true, pfb:true },
];

const MARKETING_EMPLOYEES = [
  { emp_key:'mohammed_saad', first:'Mohammed', last:'Saad', role:'Marketing Specialist', initials:'MS',
    att:97, tenure:4.2, lb:12, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'haya_fahad', first:'Haya', last:'Fahad', role:'Digital Marketing Specialist', initials:'HF',
    att:95, tenure:1.3, lb:6, perf:true, goal:true, cert:false, mfb:true, pfb:true },
  { emp_key:'fares_nasser', first:'Fares', last:'Nasser', role:'Content Marketing Specialist', initials:'FN',
    att:81, tenure:3.6, lb:9, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'fatimah_turki', first:'Fatimah', last:'Turki', role:'Marketing Analyst', initials:'FT',
    att:93, tenure:2.9, lb:14, perf:true, goal:true, cert:false, mfb:true, pfb:true },
  { emp_key:'sultan_waleed', first:'Sultan', last:'Waleed', role:'Social Media Specialist', initials:'SW',
    att:98, tenure:5.1, lb:10, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'nada_ahmed', first:'Nada', last:'Ahmed', role:'Marketing Coordinator', initials:'NA2',
    att:90, tenure:3.3, lb:7, perf:true, goal:false, cert:true, mfb:false, pfb:true },
  { emp_key:'ziyad_ibrahim', first:'Ziyad', last:'Ibrahim', role:'Brand Specialist', initials:'ZI',
    att:79, tenure:2.5, lb:15, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'shatha_majed', first:'Shatha', last:'Majed', role:'Growth Marketing Specialist', initials:'SM2',
    att:94, tenure:4.7, lb:5, perf:false, goal:true, cert:false, mfb:true, pfb:true },
  { emp_key:'abdullah_hassan', first:'Abdullah', last:'Hassan', role:'Marketing Team Lead', initials:'AH',
    att:96, tenure:6.0, lb:11, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'jawaher_saud', first:'Jawaher', last:'Saud', role:'SEO Specialist', initials:'JS',
    att:88, tenure:1.6, lb:8, perf:true, goal:true, cert:true, mfb:true, pfb:true },
  { emp_key:'joud_khalid', first:'Joud', last:'Khalid', role:'Marketing Assistant', initials:'JK',
    att:91, tenure:1.9, lb:8, perf:true, goal:true, cert:false, mfb:true, pfb:true },
];

const PERFORMANCE_REVIEWS = {
  sarah_ahmed: "Strong performance on cloud infrastructure projects. Excels at building scalable microservices. Performance consistently above target. Good communicator across teams.",
  faisal_mohammed: "Solid technical work but leadership skills need development. Security review process not always followed. Good problem-solving on data structures and fundamentals.",
  omar_saad: "Cross-functional coordination is strong. Backend API work is solid but REST conventions need improvement. Mentors junior engineers informally.",
  lama_khalid: "Frontend delivery is consistent. Starting to take on infrastructure tasks but needs container orchestration skills. Performance on target.",
  turki_fahad: "Excellent DevOps output. Security best practices occasionally lapse in code reviews. Mentors new hires regularly. Above-target performance.",
  hessa_nasser: "Strong API testing coverage. Cloud deployment work shows potential. Agile ceremonies participation needs improvement. Goals partially met this cycle.",
  hassan_sultan: "Data pipeline work is above target. Leadership potential emerging. Starting Kubernetes container work. Good collaboration across teams.",
  rana_waleed: "Mobile development solid. Performance below target last cycle. Leadership certification not completed. Code reviews show security coding gaps.",
  majed_ibrahim: "Team leadership excellent. Cloud architecture decisions are strong. API design standards need reinforcement across team. Above-target performance.",
  dana_talal: "SRE work is reliable. Leadership potential early-stage. Security practices solid. Needs development in data structure choices for scale.",
  meshal_abdullah: "Consistent contributor on cloud projects. Agile sprint participation is good. API design could improve. Works well with the team.",
  layla_mohammed: "Strong financial modeling work on quarterly forecasts. Increasing exposure to consolidated reporting and IFRS requirements. Good stakeholder presentation skills.",
  yousef_abdullah: "Excellent with Power BI dashboards. Recently took ownership of a new cost center budget. Excel-heavy workflow could be improved with advanced automation.",
  noura_ahmed: "Good accounting fundamentals. Manager feedback highlights an opportunity to present financial findings to non-finance teams more clearly. Audit preparation is growing responsibility.",
  bandar_khalid: "Payroll processing is accurate. IFRS reporting exposure increasing. Excel spreadsheet workflows are manual and time-consuming.",
  amal_saad: "Budget management is strong. Expanded into corporate tax and risk areas. Power BI adoption would streamline reporting. Performance above target.",
  nasser_faisal: "Treasury analysis is reliable. Risk management gaps identified during last audit prep. Stakeholder communication needs improvement for presenting to non-finance audiences.",
  wafa_turki: "Internal audit work is thorough. Excel-heavy workflows need modernization. Power BI could streamline the monthly reporting burden significantly.",
  ibrahim_nawaf: "Accounts payable processes are efficient. Has started taking on tax-related tasks without formal training. Stakeholder communication is a growth area.",
  munira_hassan: "Financial controlling is excellent. Leads IFRS compliance reviews. Strong risk management skills. Performance consistently above target.",
  saud_majed: "Senior accounting work is improving. Power BI training started. Budget tracking for new cost center has expanded scope recently.",
  rayan_mohammed: "Finance coordination role is expanding. Excel and reporting workflows are manual. Good team collaboration and meeting facilitation skills.",
  ahmed_khalid: "IT support quality is high. Ticket resolution time above target particularly on Tier-2 issues. Network security incidents increasing in volume.",
  reem_mohammed: "Help desk performance is solid. Incident update communication to end users needs improvement. Cloud-hosted system support requests are growing.",
  khalid_sultan: "Systems administration is strong. ITIL framework knowledge would improve service management approach. Technical documentation quality is inconsistent.",
  maha_fahad: "Network support is reliable. Security-related tickets increasing beyond current training. Account provisioning tasks now part of the role.",
  waleed_saad: "Team leadership excellent. Cloud infrastructure knowledge needs updating as support volume shifts. Technical documentation and knowledge base articles need consistency.",
  aisha_turki: "Desktop support is steady. Handles high volume of concurrent tickets. Incident prioritization and structured management would help throughput. ITIL certification path fits career goals.",
  nawaf_hassan: "Security analysis work is solid. Active Directory administration tasks increasing. Customer communication during incidents could be clearer.",
  rawan_abdullah: "Service desk coordination improving. Technical documentation is inconsistent. ITIL foundations would help structure the team's service delivery. Cloud requests growing.",
  talal_ibrahim: "Infrastructure work is excellent. Ticket resolution for network and security incidents is effective. Incident management documentation could be more structured.",
  alanoud_majed: "IT support quality is developing. Customer communication during incidents needs work. Cloud infrastructure requests require additional knowledge. Active Directory work is new.",
  sadeem_ahmed: "Operations analysis is solid. Documentation quality is improving. Incident management processes are being adopted. Good team player.",
  mohammed_saad: "Campaign management is strong. Digital analytics and SEO overlap with recent projects is growing. Brand positioning work increasing.",
  haya_fahad: "Digital marketing execution is solid. Campaign planning and content strategy are areas for growth. Marketing automation adoption would reduce manual setup time.",
  fares_nasser: "Content creation quality is high. Brand positioning involvement has increased. Presentation skills in leadership reviews need sharpening.",
  fatimah_turki: "Marketing analysis is reliable. SEO and paid search overlap with current projects. Social media performance reporting is currently manual.",
  sultan_waleed: "Social media strategy is excellent. Campaign automation would reduce manual setup significantly. Content planning and copywriting quality needs reinforcement.",
  nada_ahmed: "Marketing coordination is steady. Brand-level decisions are increasing but framework knowledge is limited. Campaign analytics measurement needs improvement.",
  ziyad_ibrahim: "Brand work is developing. Social media analytics reporting is manual. Content strategy knowledge would support the transition to campaign planning.",
  shatha_majed: "Growth marketing shows promise. Copywriting and messaging clarity flagged by manager. Presentation and storytelling in leadership reviews needs work.",
  abdullah_hassan: "Marketing leadership is strong. Campaign analytics and SEO integration with brand strategy are priorities. Brand positioning frameworks well understood.",
  jawaher_saud: "SEO work is solid. Content strategy and marketing automation adoption would expand effectiveness. Social media analytics reporting is manual.",
  joud_khalid: "Marketing assistant duties handled well. Learning digital campaign analytics. Content planning and brand positioning knowledge is early stage.",
};

// Request templates per employee type (based on recentRequest in prototype)
const REQUEST_TEMPLATES = {
  // By attendance group: 97%,96%,98%=pending leave 2d ago; 95%=overtime policy check; 81%,79%=expense ready; 93%=approved leave; 90%=overtime policy; 94%=approved leave; 88%=overtime policy
  pending_leave: { type:'leave', status:'pending', daysAgo:2 },
  overtime_policy: { type:'overtime', status:'needs_policy_check', daysAgo:2 },
  expense_ready: { type:'expense', status:'ready', daysAgo:1 },
  approved_leave: { type:'leave', status:'approved', daysAgo:5 },
};

function getRequestTemplate(att) {
  if (att === 97 || att === 96 || att === 98) return 'pending_leave';
  if (att === 95 || att === 90 || att === 88) return 'overtime_policy';
  if (att === 81 || att === 79) return 'expense_ready';
  if (att === 93 || att === 94) return 'approved_leave';
  return 'pending_leave';
}

const COURSES = {
  engineering: [
    { title:'Advanced Cloud Computing', level:'Advanced', duration:'8 hours', format:'Self-paced online', description:'A hands-on course covering scalable cloud architecture, deployment automation, and cost optimization for production systems.' },
    { title:'Leadership Fundamentals', level:'Beginner', duration:'5 hours', format:'Self-paced online', description:'An introduction to core leadership skills including delegation, feedback, and managing cross-functional priorities.' },
    { title:'Agile Project Management', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers agile ceremonies, sprint planning, and backlog management for engineers coordinating cross-functional work.' },
    { title:'Kubernetes & Container Orchestration', level:'Advanced', duration:'9 hours', format:'Self-paced online', description:'Covers container orchestration, scaling strategies, and production deployment patterns using Kubernetes.' },
    { title:'Secure Coding Practices', level:'Intermediate', duration:'5 hours', format:'Self-paced online', description:'Covers common vulnerability patterns and secure-by-design coding practices for modern application development.' },
    { title:'API Design Best Practices', level:'Intermediate', duration:'4 hours', format:'Self-paced online', description:'Covers REST and API versioning conventions, documentation standards, and designing for long-term maintainability.' },
    { title:'Data Structures for Scale', level:'Advanced', duration:'7 hours', format:'Self-paced online', description:'Covers advanced data structure selection and performance trade-offs for high-throughput systems.' },
    { title:'Technical Mentorship Skills', level:'Beginner', duration:'3 hours', format:'Self-paced online', description:'Covers structured approaches to mentoring junior engineers, including code review feedback and onboarding support.' },
  ],
  finance: [
    { title:'Advanced Financial Modeling', level:'Advanced', duration:'8 hours', format:'Self-paced online', description:'Covers scenario modeling, sensitivity analysis, and building forecast models for complex business decisions.' },
    { title:'Data Analysis with Power BI', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers building dashboards, automating recurring reports, and visualizing financial data using Power BI.' },
    { title:'Stakeholder Communication', level:'Beginner', duration:'4 hours', format:'Self-paced online', description:'Covers presenting financial data clearly to non-financial audiences and structuring persuasive summaries.' },
    { title:'IFRS Reporting Standards', level:'Advanced', duration:'7 hours', format:'Self-paced online', description:'Covers core IFRS principles and their practical application in consolidated financial reporting.' },
    { title:'Budgeting & Forecasting', level:'Intermediate', duration:'5 hours', format:'Self-paced online', description:'Covers building operating budgets, variance analysis, and rolling forecast techniques.' },
    { title:'Risk Management Fundamentals', level:'Intermediate', duration:'5 hours', format:'Self-paced online', description:'Covers structured risk identification, assessment frameworks, and audit preparation practices.' },
    { title:'Excel for Finance Professionals', level:'Beginner', duration:'4 hours', format:'Self-paced online', description:'Covers advanced formulas, pivot tables, and automation techniques for finance reporting workflows.' },
    { title:'Corporate Tax Essentials', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers core corporate tax principles and compliance considerations relevant to day-to-day finance work.' },
  ],
  itsupport: [
    { title:'Advanced Troubleshooting Techniques', level:'Advanced', duration:'6 hours', format:'Self-paced online', description:'Covers systematic diagnostic approaches for complex, recurring, and hard-to-reproduce technical issues.' },
    { title:'Customer Communication Skills', level:'Beginner', duration:'3 hours', format:'Self-paced online', description:'Covers clear, empathetic communication techniques for updating end users during technical incidents.' },
    { title:'ITIL Foundations', level:'Beginner', duration:'5 hours', format:'Self-paced online', description:'Covers core ITIL service management concepts including incident, problem, and change management.' },
    { title:'Network Security Essentials', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers core network security concepts including access control, VPNs, and common attack vectors.' },
    { title:'Cloud Infrastructure Basics', level:'Beginner', duration:'5 hours', format:'Self-paced online', description:'Covers foundational cloud infrastructure concepts for supporting hybrid on-premise and cloud environments.' },
    { title:'Incident Management Best Practices', level:'Intermediate', duration:'4 hours', format:'Self-paced online', description:'Covers prioritization frameworks and structured workflows for managing concurrent support incidents.' },
    { title:'Active Directory Administration', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers user and group provisioning, permissions structures, and everyday AD administration tasks.' },
    { title:'Technical Documentation Writing', level:'Beginner', duration:'3 hours', format:'Self-paced online', description:'Covers structuring clear, consistent internal documentation and knowledge-base articles.' },
  ],
  marketing: [
    { title:'Digital Campaign Analytics', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers measurement frameworks, attribution basics, and analyzing paid campaign performance.' },
    { title:'Content Strategy Fundamentals', level:'Beginner', duration:'5 hours', format:'Self-paced online', description:'Covers planning content calendars, audience segmentation, and aligning content with campaign goals.' },
    { title:'Presentation & Storytelling Skills', level:'Beginner', duration:'4 hours', format:'Self-paced online', description:'Covers structuring persuasive presentations and communicating marketing results to leadership.' },
    { title:'SEO & SEM Fundamentals', level:'Intermediate', duration:'6 hours', format:'Self-paced online', description:'Covers organic search optimization and paid search campaign fundamentals.' },
    { title:'Marketing Automation Tools', level:'Intermediate', duration:'5 hours', format:'Self-paced online', description:'Covers setting up automated campaign workflows and reducing manual campaign configuration work.' },
    { title:'Brand Positioning Strategy', level:'Advanced', duration:'6 hours', format:'Self-paced online', description:'Covers frameworks for defining brand positioning and aligning campaigns with long-term brand strategy.' },
    { title:'Social Media Analytics', level:'Beginner', duration:'4 hours', format:'Self-paced online', description:'Covers tracking and interpreting social performance metrics across major platforms.' },
    { title:'Copywriting for Marketers', level:'Beginner', duration:'4 hours', format:'Self-paced online', description:'Covers writing clear, persuasive marketing copy across channels and campaign types.' },
  ],
};

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Running schema...');
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    await client.query(schema);

    console.log('Clearing existing data...');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM recommendations');
    await client.query('DELETE FROM performance_reviews');
    await client.query('DELETE FROM requests');
    await client.query('DELETE FROM attendance_records');
    await client.query('DELETE FROM courses');
    await client.query('DELETE FROM employees');
    await client.query('DELETE FROM departments');

    console.log('Seeding departments...');
    const deptIds = {};
    for (const d of DEPARTMENTS) {
      const r = await client.query(
        'INSERT INTO departments (key, label, manager_name) VALUES ($1,$2,$3) RETURNING id',
        [d.key, d.label, d.manager_name]
      );
      deptIds[d.key] = r.rows[0].id;
    }

    console.log('Seeding courses...');
    const courseIds = {};
    for (const [deptKey, courses] of Object.entries(COURSES)) {
      courseIds[deptKey] = {};
      for (const c of courses) {
        const r = await client.query(
          'INSERT INTO courses (title, department_key, level, duration, format, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [c.title, deptKey, c.level, c.duration, c.format, c.description]
        );
        courseIds[deptKey][c.title] = r.rows[0].id;
      }
    }

    const today = new Date('2026-07-10');
    const q3Start = new Date('2025-07-01');
    const q3End = new Date('2025-09-30');
    const jul2026Start = new Date('2026-07-01');
    const jul2026End = new Date('2026-07-09');
    const q3Days = getWorkingDays(q3Start, q3End);
    const jul2026Days = getWorkingDays(jul2026Start, jul2026End);

    const ALL_EMPLOYEES = [
      ...ENGINEERING_EMPLOYEES.map(e => ({ ...e, dept:'engineering' })),
      ...FINANCE_EMPLOYEES.map(e => ({ ...e, dept:'finance' })),
      ...ITSUPPORT_EMPLOYEES.map(e => ({ ...e, dept:'itsupport' })),
      ...MARKETING_EMPLOYEES.map(e => ({ ...e, dept:'marketing' })),
    ];

    const empIds = {};
    console.log('Seeding employees, attendance, requests, and reviews...');

    for (const emp of ALL_EMPLOYEES) {
      const roleStart = new Date(today);
      roleStart.setFullYear(roleStart.getFullYear() - Math.floor(emp.tenure));
      const dayFraction = (emp.tenure % 1) * 365;
      roleStart.setDate(roleStart.getDate() - Math.round(dayFraction));

      const hireDate = new Date(roleStart);
      hireDate.setMonth(hireDate.getMonth() - 3);

      const deptManagerMap = { engineering:'Fahad Mohammed', finance:'Saad Abdullah', itsupport:'Lena Khalid', marketing:'Reema Ahmed' };
      const managerName = deptManagerMap[emp.dept];

      const empR = await client.query(
        `INSERT INTO employees (emp_key, first_name, last_name, role, department_id, manager_name, initials,
           hire_date, role_start_date, leave_balance, leadership_cert, performance_rating_met,
           goal_achievement_met, manager_feedback_positive, peer_feedback_positive)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [
          emp.emp_key, emp.first, emp.last, emp.role, deptIds[emp.dept], managerName, emp.initials,
          hireDate.toISOString().split('T')[0],
          roleStart.toISOString().split('T')[0],
          emp.lb, emp.cert, emp.perf, emp.goal, emp.mfb, emp.pfb,
        ]
      );
      const empId = empR.rows[0].id;
      empIds[emp.emp_key] = empId;

      // Q3 2025 attendance
      const attRecords = generateAttendance(q3Days, emp.att, empId);
      for (const ar of attRecords) {
        await client.query(
          'INSERT INTO attendance_records (employee_id, date, status) VALUES ($1,$2,$3)',
          [empId, ar.date, ar.status]
        );
      }

      // July 2026 attendance — give late records to employees with <90% attendance
      if (emp.att < 90) {
        const lateCount = emp.att < 82 ? 3 : 2;
        for (let i = 0; i < jul2026Days.length; i++) {
          const status = i < lateCount ? 'late' : 'present';
          await client.query(
            'INSERT INTO attendance_records (employee_id, date, status) VALUES ($1,$2,$3)',
            [empId, jul2026Days[i].toISOString().split('T')[0], status]
          );
        }
      } else {
        // present in July 2026
        for (const d of jul2026Days) {
          await client.query(
            'INSERT INTO attendance_records (employee_id, date, status) VALUES ($1,$2,$3)',
            [empId, d.toISOString().split('T')[0], 'present']
          );
        }
      }

      // Requests
      const reqKey = getRequestTemplate(emp.att);
      const tmpl = REQUEST_TEMPLATES[reqKey];
      const submittedAt = new Date(today);
      submittedAt.setDate(submittedAt.getDate() - tmpl.daysAgo);
      await client.query(
        'INSERT INTO requests (employee_id, type, submitted_at, status) VALUES ($1,$2,$3,$4)',
        [empId, tmpl.type, submittedAt.toISOString(), tmpl.status]
      );

      // Performance review
      const notes = PERFORMANCE_REVIEWS[emp.emp_key] || `${emp.first} ${emp.last} is a valued team member with solid performance this quarter.`;
      await client.query(
        'INSERT INTO performance_reviews (employee_id, cycle, notes) VALUES ($1,$2,$3)',
        [empId, 'Q3 2025', notes]
      );
    }

    // Override specific QUEUE_PEOPLE requests to match the prototype exactly
    const queueOverrides = [
      { key:'meshal_abdullah', type:'leave', status:'overdue', daysAgo:4 },
      { key:'rayan_mohammed', type:'overtime', status:'needs_policy_check', daysAgo:2 },
      { key:'sadeem_ahmed', type:'expense', status:'ready', daysAgo:1 },
      { key:'joud_khalid', type:'leave', status:'overdue', daysAgo:2 },
    ];
    for (const qo of queueOverrides) {
      const empId = empIds[qo.key];
      if (!empId) continue;
      await client.query('DELETE FROM requests WHERE employee_id = $1', [empId]);
      const sub = new Date(today);
      sub.setDate(sub.getDate() - qo.daysAgo);
      await client.query(
        'INSERT INTO requests (employee_id, type, submitted_at, status) VALUES ($1,$2,$3,$4)',
        [empId, qo.type, sub.toISOString(), qo.status]
      );
    }

    console.log('Seed complete!');
    console.log(`Seeded: ${ALL_EMPLOYEES.length} employees, ${Object.keys(COURSES).reduce((s,k) => s + COURSES[k].length, 0)} courses`);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
