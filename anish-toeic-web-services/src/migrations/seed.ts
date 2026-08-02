/**
 * Deterministic, idempotent development/test seed.
 *
 * - NO Math.random: every value is fixed literal data or derived from it.
 * - Idempotent: every insert is SELECT-then-INSERT keyed on natural keys
 *   (slug / email / order_index), so re-running never duplicates rows and
 *   keeps stable IDs.
 * - Safe to run against an empty or already-seeded database.
 * - Content is self-written synthetic fixture material — no real exam data.
 * - Media is self-generated in code: a geometric SVG per question (Part 1
 *   photographs, SW picture prompts) and a tiny deterministic WAV tone per
 *   audio question (Parts 1–4). No external assets, no network fetches, and
 *   both URIs fit the VARCHAR(1024) media columns.
 *
 * Run: npm run seed  (or: node dist/migrations/seed.js)
 * Requires DB env vars (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)
 * and migration 002_media_columns (adds prep_time_seconds,
 * record_time_seconds, min_words to toeic_questions).
 */

import { pool } from '../services/db.service';
import { RowDataPacket } from 'mysql2';
import { scryptSync } from 'crypto';

// ---------------------------------------------------------------------------
// Constants — deterministic fixture material
// ---------------------------------------------------------------------------

const SALT = 'anish-seed-fixed-salt-000000000000000000';
const SEED_PASSWORD = 'seed-password-123';

// ---------------------------------------------------------------------------
// Synthetic media generators — pure, deterministic, no I/O.
//
// svgDataUri(sceneId): a 640×420 geometric "photograph" scene. Colors and
//   shape positions derive from the scene id, so every question gets a
//   distinct-but-stable picture.
// wavDataUri(questionId): a tiny mono 8-bit PCM tone (0.15s @ 4kHz, RIFF/WAVE
//   header + samples = 644 bytes → ~880 base64 chars, fits audio_url
//   VARCHAR(1024)). Frequency varies per question id.
// ---------------------------------------------------------------------------

const SVG_COLORS = ['#e6a23c', '#5b8def', '#67c23a', '#9b59b6', '#e67e22', '#1abc9c', '#16a085', '#c0392b'];

function svgDataUri(sceneId: number): string {
  const c = (i: number) => SVG_COLORS[(sceneId + i) % SVG_COLORS.length];
  const skyH = 300 - (sceneId % 3) * 25;
  const sun = 40 + ((sceneId * 37) % 80);
  const sunX = 70 + ((sceneId * 61) % 180);
  const sunY = 110 + (sceneId % 3) * 25;
  const bldgX = 150 + ((sceneId * 53) % 230);
  const bldgH = 120 + (sceneId % 3) * 25;
  const treeX = 360 + ((sceneId * 17) % 80);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">` +
    `<rect width="640" height="${skyH}" fill="${c(0)}"/>` +
    `<rect y="${skyH}" width="640" height="120" fill="${c(1)}"/>` +
    `<circle cx="${sunX}" cy="${sunY}" r="${sun}" fill="${c(2)}"/>` +
    `<rect x="${bldgX}" y="180" width="130" height="${bldgH}" fill="${c(3)}"/>` +
    `<rect x="${bldgX + 15}" y="210" width="20" height="20" fill="${c(0)}"/>` +
    `<rect x="${bldgX + 95}" y="210" width="20" height="20" fill="${c(0)}"/>` +
    `<polygon points="${treeX},100 ${treeX - 55},230 ${treeX + 55},230" fill="${c(4)}"/>` +
    `<rect x="${treeX - 10}" y="230" width="20" height="70" fill="${c(5)}"/>` +
    `<rect x="40" y="300" width="140" height="26" fill="${c(6)}"/>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function wavDataUri(questionId: number): string {
  const sampleRate = 4000;
  const sampleCount = 600; // 0.15s — compact enough for VARCHAR(1024)
  const freq = 300 + ((questionId * 137) % 60) * 10; // 300–890 Hz, stable per id
  const pcm = Buffer.alloc(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    // Envelope fades in/out to avoid clicks.
    const env = Math.min(1, i / 40, (sampleCount - i) / 40);
    pcm[i] = Math.round(128 + 96 * env * Math.sin(2 * Math.PI * freq * t));
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + sampleCount, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate, 28); // byte rate: 1 ch × 8-bit
  header.writeUInt16LE(1, 32); // block align
  header.writeUInt16LE(8, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(sampleCount, 40);
  return `data:audio/wav;base64,${Buffer.concat([header, pcm]).toString('base64')}`;
}

const USERS: Array<{ email: string; displayName: string }> = [
  { email: 'seed.owner@example.com', displayName: 'Seed Owner' },
  { email: 'seed.other@example.com', displayName: 'Seed Other' },
];

const COLLECTIONS: Array<{ title: string; slug: string }> = [
  { title: 'Anish Full Practice', slug: 'anish-full-practice' },
];

interface ReviewContent {
  explanation?: string;
  sampleResponse?: string;
  rubric?: string;
}

interface QuestionData {
  type: string;
  order: number;
  content: string;
  options?: string[]; // 4 options; correct option is options[correctIndex]
  correctIndex?: number;
  review: ReviewContent;
  /** media to attach: 'image' → synthetic SVG in image_url; 'audio' → synthetic WAV in audio_url; 'image_audio' → both (Part 1 photograph + narration) */
  media?: 'image' | 'audio' | 'image_audio';
  /** Writing: minimum word count (002_media_columns) */
  minWords?: number;
  /** Speaking: prep time in seconds (002_media_columns) */
  prepTimeSeconds?: number;
  /** Speaking: recording time in seconds (002_media_columns) */
  recordTimeSeconds?: number;
}

interface SectionData {
  title: string;
  instructions: string;
  questions: QuestionData[];
}

interface ExamData {
  slug: string;
  title: string;
  durationMinutes: number;
  questionCount: number;
  skillType: 'LR' | 'SW';
  sections: SectionData[];
}

const LR_EXAM: ExamData = {
  slug: 'anish-full-lr-001',
  title: 'Anish Full Practice 1 — Listening & Reading',
  durationMinutes: 120,
  questionCount: 21,
  skillType: 'LR',
  sections: [
    {
      title: 'Listening Part 1 — Photographs',
      instructions: 'For each question, choose the statement that best describes the photograph.',
      questions: [
        {
          type: 'MULTIPLE_CHOICE',
          order: 1,
          media: 'image_audio',
          content: 'The photograph shows a man reading a menu at a table in a restaurant.',
          options: ['He is reading a menu.', 'He is boarding a train.', 'He is watering the plants.', 'He is checking his watch.'],
          correctIndex: 0,
          review: { explanation: 'The photograph shows the man reading a menu at a table.' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 2,
          media: 'image_audio',
          content: 'The photograph shows a busy train station with several platforms and a timetable board.',
          options: ['At a bookstore', 'At a post office', 'At a train station', 'At a flower shop'],
          correctIndex: 2,
          review: { explanation: 'The platforms and timetable boards indicate a train station.' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 3,
          media: 'image_audio',
          content: 'The photograph shows a woman carrying an umbrella while walking along a street.',
          options: ['A passport', 'A camera', 'A shopping bag', 'An umbrella'],
          correctIndex: 3,
          review: { explanation: 'The woman is holding an umbrella under her arm.' },
        },
      ],
    },
    {
      title: 'Listening Part 2 — Question–Response',
      instructions: 'Listen to the question and choose the best response.',
      questions: [
        {
          type: 'MULTIPLE_CHOICE',
          order: 1,
          media: 'audio',
          content: 'When does the meeting start?',
          options: ["At nine o'clock.", 'At the conference room.', 'By the project manager.', 'Because the schedule changed.'],
          correctIndex: 0,
          review: { explanation: 'The correct response states a time, as the question asks "when".' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 2,
          media: 'audio',
          content: 'Why did you cancel the order?',
          options: ['The invoice was lost.', 'I was on vacation.', 'The shipment arrived late.', 'The client asked us to.'],
          correctIndex: 3,
          review: { explanation: 'The question asks for a reason; the client request is the reason.' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 3,
          media: 'audio',
          content: 'How often does the bus run?',
          options: ['About twenty minutes.', 'Every half hour.', 'Near the station.', 'With the driver.'],
          correctIndex: 1,
          review: { explanation: '"How often" asks for a frequency, given by "every half hour".' },
        },
      ],
    },
    {
      title: 'Listening Part 3 — Conversations',
      instructions: 'Listen to the conversation and choose the best answer to each question.',
      questions: [
        {
          type: 'MULTIPLE_CHOICE',
          order: 1,
          media: 'audio',
          content: 'What does the woman offer to do for the man?',
          options: ['Meet the supplier', 'Reschedule the delivery', 'Print the report', 'Call the client'],
          correctIndex: 1,
          review: { explanation: 'The woman offers to move the delivery to a later slot.' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 2,
          media: 'audio',
          content: 'When will the parts be available?',
          options: ['By Thursday afternoon.', 'Next quarter.', 'After the holiday.', 'At the end of the month.'],
          correctIndex: 0,
          review: { explanation: 'The supplier confirmed the parts arrive Thursday afternoon.' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 3,
          media: 'audio',
          content: 'What will the speakers do next?',
          options: ['Visit the warehouse', 'Place a new order', 'Review the inventory list', 'Cancel the shipment'],
          correctIndex: 2,
          review: { explanation: 'They agree to check the inventory list before ordering.' },
        },
      ],
    },
    {
      title: 'Listening Part 4 — Talks',
      instructions: 'Listen to the talk and choose the best answer to each question.',
      questions: [
        {
          type: 'MULTIPLE_CHOICE',
          order: 1,
          media: 'audio',
          content: 'What is the main purpose of the announcement?',
          options: ['To introduce a new manager', 'To announce a schedule change', 'To request more staff', 'To promote a sale'],
          correctIndex: 1,
          review: { explanation: 'The announcement explains the new opening hours.' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 2,
          media: 'audio',
          content: 'Who is the speaker addressing?',
          options: ['New employees', 'Hotel guests', 'Store customers', 'Board members'],
          correctIndex: 1,
          review: { explanation: 'The speaker welcomes the audience as hotel guests.' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 3,
          media: 'audio',
          content: 'What should listeners do if they have questions?',
          options: ['Call the front desk.', 'Send an email.', 'Visit the website.', 'Ask a colleague.'],
          correctIndex: 0,
          review: { explanation: 'The talk directs questions to the front desk.' },
        },
      ],
    },
    {
      title: 'Reading Part 5 — Incomplete Sentences',
      instructions: 'Choose the word or phrase that best completes the sentence.',
      questions: [
        {
          type: 'MULTIPLE_CHOICE',
          order: 1,
          content: 'The new software is expected to ___ processing time by half.',
          options: ['reduce', 'reduces', 'reducing', 'reduction'],
          correctIndex: 0,
          review: { explanation: '"to reduce" is the correct infinitive after "expected".' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 2,
          content: 'All applicants must submit their forms ___ Friday.',
          options: ['by', 'during', 'between', 'until'],
          correctIndex: 0,
          review: { explanation: '"by Friday" sets the deadline; the other prepositions do not fit.' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 3,
          content: 'The report was written ___ the finance team.',
          options: ['from', 'by', 'on', 'with'],
          correctIndex: 1,
          review: { explanation: 'The passive agent is introduced with "by".' },
        },
      ],
    },
    {
      title: 'Reading Part 6 — Text Completion',
      instructions: 'Choose the best word or phrase to fill the blank.',
      questions: [
        {
          type: 'MULTIPLE_CHOICE',
          order: 1,
          content: 'Thank you for your order. Our team ___ your items within two business days.',
          options: ['will ship', 'shipped', 'shipping', 'have shipped'],
          correctIndex: 0,
          review: { explanation: 'A future promise requires the future tense "will ship".' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 2,
          content: 'If you have any questions, please ___ not hesitate to contact our support desk.',
          options: ['does', 'do', 'did', 'done'],
          correctIndex: 1,
          review: { explanation: '"Please do not hesitate" is the fixed polite form.' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 3,
          content: 'We appreciate your patience ___ we process your request.',
          options: ['although', 'while', 'unless', 'because'],
          correctIndex: 1,
          review: { explanation: '"while" describes something happening at the same time.' },
        },
      ],
    },
    {
      title: 'Reading Part 7 — Reading Comprehension',
      instructions: 'Read the passage and choose the best answer to each question.',
      questions: [
        {
          type: 'MULTIPLE_CHOICE',
          order: 1,
          content: 'According to the notice, when will the store open on Sundays?',
          options: ['At 9:00 a.m.', 'At 10:00 a.m.', 'At noon', 'At 8:00 p.m.'],
          correctIndex: 0,
          review: { explanation: 'The notice states Sunday opening at 9:00 a.m.' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 2,
          content: 'What must customers do to join the loyalty program?',
          options: ['Complete an online form', 'Show a photo ID', 'Purchase a gift card', 'Call the manager'],
          correctIndex: 0,
          review: { explanation: 'Registration is done through the online form on the website.' },
        },
        {
          type: 'MULTIPLE_CHOICE',
          order: 3,
          content: 'What benefit does the loyalty program offer?',
          options: ['Free parking', 'Points on purchases', 'Priority seating', 'Free delivery'],
          correctIndex: 1,
          review: { explanation: 'Members earn points on every purchase.' },
        },
      ],
    },
  ],
};

const SW_EXAM: ExamData = {
  slug: 'anish-full-sw-001',
  title: 'Anish Full Practice 1 — Speaking & Writing',
  durationMinutes: 60,
  questionCount: 16,
  skillType: 'SW',
  sections: [
    {
      title: 'Speaking',
      instructions: 'Record your response for each question within the given time.',
      questions: [
        // Q1–Q2: Read aloud (text prompt)
        {
          type: 'SPEAKING',
          order: 1,
          content:
            'Welcome to our company\u2019s annual health fair. Please visit the information desk to pick up a schedule of events and a map of the venue.',
          prepTimeSeconds: 30,
          recordTimeSeconds: 45,
          review: {
            sampleResponse: 'Welcome to our company\u2019s annual health fair. Please visit the information desk to pick up a schedule of events and a map of the venue.',
            rubric: 'Fluency, pronunciation, vocabulary, grammar, and coherence are evaluated on a 0–200 scale.',
          },
        },
        {
          type: 'SPEAKING',
          order: 2,
          content:
            'Due to unexpected maintenance, the elevator on the west side of the building will be closed until Friday morning. We apologize for the inconvenience.',
          prepTimeSeconds: 30,
          recordTimeSeconds: 45,
          review: {
            sampleResponse: 'Due to unexpected maintenance, the elevator on the west side of the building will be closed until Friday morning. We apologize for the inconvenience.',
            rubric: 'Fluency, pronunciation, vocabulary, grammar, and coherence are evaluated on a 0–200 scale.',
          },
        },
        // Q3: Describe the picture (image prompt)
        {
          type: 'SPEAKING',
          order: 3,
          media: 'image',
          content: 'Look at the picture. Describe what you see in as much detail as possible.',
          prepTimeSeconds: 30,
          recordTimeSeconds: 45,
          review: {
            sampleResponse: 'The picture shows a bright outdoor scene with a tall building on the left, a green tree on the right, and a colorful sky. There is a round sun in the sky and a small sign near the ground.',
            rubric: 'Fluency, pronunciation, vocabulary, grammar, and coherence are evaluated on a 0–200 scale.',
          },
        },
        // Q4–Q5: Respond to questions (text situation prompt)
        {
          type: 'SPEAKING',
          order: 4,
          content:
            'Your supervisor asks: \u201cWhich project should we prioritize this month and why?\u201d Respond with your recommendation and give two reasons to support it.',
          prepTimeSeconds: 30,
          recordTimeSeconds: 60,
          review: {
            sampleResponse: 'We should prioritize the customer portal update because it affects the most clients. First, it solves the login issue many users reported. Second, it can be completed within two weeks with our current team.',
            rubric: 'Fluency, pronunciation, vocabulary, grammar, and coherence are evaluated on a 0–200 scale.',
          },
        },
        {
          type: 'SPEAKING',
          order: 5,
          content:
            'A colleague asks: \u201cDo you think we should move the weekly meeting to Friday mornings?\u201d Respond with your opinion and explain your reasoning.',
          prepTimeSeconds: 30,
          recordTimeSeconds: 60,
          review: {
            sampleResponse: 'Yes, I think Friday mornings work better. Reports are usually finished by Thursday, so Friday meetings have more complete data. Also, Monday mornings are busier with email and other urgent tasks.',
            rubric: 'Fluency, pronunciation, vocabulary, grammar, and coherence are evaluated on a 0–200 scale.',
          },
        },
        // Q6–Q8: Respond using information (text info prompt)
        {
          type: 'SPEAKING',
          order: 6,
          content:
            'The table shows delivery times for the three shipping options. Using the information, recommend one option for a customer who needs an order delivered by Thursday.<table border="1" cellpadding="4"><tr><th>Option</th><th>Cost</th><th>Delivery time</th></tr><tr><td>Standard</td><td>$8</td><td>5 days</td></tr><tr><td>Express</td><td>$15</td><td>2 days</td></tr><tr><td>Overnight</td><td>$25</td><td>Next day</td></tr></table>',
          prepTimeSeconds: 30,
          recordTimeSeconds: 60,
          review: {
            sampleResponse: 'I recommend the Express option. It costs $15 and delivers in two days, which is before Thursday. Standard delivery takes five days and would be too late, while Overnight is faster but costs $25, which is unnecessary.',
            rubric: 'Fluency, pronunciation, vocabulary, grammar, and coherence are evaluated on a 0–200 scale.',
          },
        },
        {
          type: 'SPEAKING',
          order: 7,
          content:
            'The schedule shows the times of three daily tours. A visitor arrives at 2:00 p.m. Using the information, tell them which tours they can still join.<table border="1" cellpadding="4"><tr><th>Tour</th><th>Departure</th><th>Duration</th></tr><tr><td>Old Town</td><td>10:00 a.m.</td><td>3 hours</td></tr><tr><td>Harbor</td><td>1:00 p.m.</td><td>2 hours</td></tr><tr><td>Gardens</td><td>3:00 p.m.</td><td>2.5 hours</td></tr></table>',
          prepTimeSeconds: 30,
          recordTimeSeconds: 60,
          review: {
            sampleResponse: 'The visitor can join the Gardens tour, which departs at 3:00 p.m. and lasts two and a half hours. The Old Town tour left at 10:00 a.m. and the Harbor tour at 1:00 p.m., so both have already departed.',
            rubric: 'Fluency, pronunciation, vocabulary, grammar, and coherence are evaluated on a 0–200 scale.',
          },
        },
        {
          type: 'SPEAKING',
          order: 8,
          content:
            'The chart lists the monthly subscription plans. A customer wants video streaming, 50 GB of storage, and a monthly price under $20. Using the information, recommend the best plan.<table border="1" cellpadding="4"><tr><th>Plan</th><th>Price</th><th>Video</th><th>Storage</th></tr><tr><td>Basic</td><td>$9</td><td>No</td><td>10 GB</td></tr><tr><td>Plus</td><td>$15</td><td>Yes</td><td>50 GB</td></tr><tr><td>Premium</td><td>$25</td><td>Yes</td><td>200 GB</td></tr></table>',
          prepTimeSeconds: 30,
          recordTimeSeconds: 60,
          review: {
            sampleResponse: 'The best plan is Plus. It costs $15 per month, which is under the customer\u2019s $20 budget, and it includes video streaming and 50 GB of storage. Basic lacks video, and Premium is over budget.',
            rubric: 'Fluency, pronunciation, vocabulary, grammar, and coherence are evaluated on a 0–200 scale.',
          },
        },
      ],
    },
    {
      title: 'Writing',
      instructions: 'Write your response in the text area. Word count is displayed as you type.',
      questions: [
        // Q1–Q5: Write a sentence about the picture (image prompt)
        {
          type: 'WRITING',
          order: 1,
          media: 'image',
          content: 'Write a sentence about the picture.',
          minWords: 25,
          review: {
            sampleResponse: 'A man is reading a menu at a table inside a restaurant.',
            rubric: 'Organization, grammar, vocabulary, and task completion are evaluated on a 0–200 scale.',
          },
        },
        {
          type: 'WRITING',
          order: 2,
          media: 'image',
          content: 'Write a sentence about the picture.',
          minWords: 25,
          review: {
            sampleResponse: 'Two colleagues are reviewing documents together in a bright office.',
            rubric: 'Organization, grammar, vocabulary, and task completion are evaluated on a 0–200 scale.',
          },
        },
        {
          type: 'WRITING',
          order: 3,
          media: 'image',
          content: 'Write a sentence about the picture.',
          minWords: 25,
          review: {
            sampleResponse: 'A delivery truck is parked in front of a warehouse.',
            rubric: 'Organization, grammar, vocabulary, and task completion are evaluated on a 0–200 scale.',
          },
        },
        {
          type: 'WRITING',
          order: 4,
          media: 'image',
          content: 'Write a sentence about the picture.',
          minWords: 25,
          review: {
            sampleResponse: 'Customers are waiting in line at the reception desk.',
            rubric: 'Organization, grammar, vocabulary, and task completion are evaluated on a 0–200 scale.',
          },
        },
        {
          type: 'WRITING',
          order: 5,
          media: 'image',
          content: 'Write a sentence about the picture.',
          minWords: 25,
          review: {
            sampleResponse: 'The chef is preparing food in the kitchen of the hotel restaurant.',
            rubric: 'Organization, grammar, vocabulary, and task completion are evaluated on a 0–200 scale.',
          },
        },
        // Q6–Q7: Respond to a written request (email prompt)
        {
          type: 'WRITING',
          order: 6,
          content:
            'Your company\u2019s training coordinator has asked employees to suggest a topic for next month\u2019s workshop. Write an email to the coordinator proposing one topic and explaining why it would be useful.',
          minWords: 60,
          review: {
            sampleResponse: 'Dear Ms. Tran, I would like to suggest a workshop on effective time management. Many of us juggle multiple deadlines, and this topic would help us plan better and reduce stress. It is also useful for both new and experienced staff. Thank you for considering my suggestion. Best regards, Linh.',
            rubric: 'Organization, grammar, vocabulary, and task completion are evaluated on a 0–200 scale.',
          },
        },
        {
          type: 'WRITING',
          order: 7,
          content:
            'The office manager has announced that the break room will be closed for one week. Write an email to the office manager describing how this will affect staff and suggesting an alternative space.',
          minWords: 60,
          review: {
            sampleResponse: 'Dear Mr. Nam, I understand the break room needs maintenance, but many staff members use it during lunch. Without it, there will be few places to eat on rainy days. I suggest opening the small meeting room on the second floor as a temporary break area. Best regards, Hoa.',
            rubric: 'Organization, grammar, vocabulary, and task completion are evaluated on a 0–200 scale.',
          },
        },
        // Q8: Write an opinion essay (essay prompt)
        {
          type: 'WRITING',
          order: 8,
          content:
            'Some companies allow employees to work from home several days a week. Do you think this practice benefits both employees and employers? Write an essay supporting your opinion with reasons and examples.',
          minWords: 200,
          review: {
            sampleResponse:
              'Remote work has become common in many companies, and I believe it benefits both employees and employers. For employees, working from home saves commuting time and reduces costs. For example, a person who travels two hours a day can use that time for rest or family. For employers, remote work can lower office expenses and allow hiring from a wider area. However, companies must invest in clear communication tools and regular check-ins to keep teams connected. In conclusion, when managed well, remote work is a win for everyone.',
            rubric: 'Organization, grammar, vocabulary, and task completion are evaluated on a 0–200 scale.',
          },
        },
      ],
    },
  ],
};

const EXAMS: ExamData[] = [LR_EXAM, SW_EXAM];

// ---------------------------------------------------------------------------
// Helpers — SELECT-then-INSERT (idempotent, stable IDs)
// ---------------------------------------------------------------------------

async function getOrCreateUser(email: string, displayName: string): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (rows.length) return rows[0].id as number;

  const passwordHash = `${SALT}:${scryptSync(SEED_PASSWORD, SALT, 64).toString('hex')}`;
  const [result] = await pool.query('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)', [
    email,
    passwordHash,
    displayName,
  ]);
  return (result as { insertId: number }).insertId;
}

async function getOrCreateCollection(title: string, slug: string): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM toeic_exam_collections WHERE slug = ? LIMIT 1', [slug]);
  if (rows.length) return rows[0].id as number;

  const [result] = await pool.query(
    'INSERT INTO toeic_exam_collections (title, slug) VALUES (?, ?)',
    [title, slug]
  );
  return (result as { insertId: number }).insertId;
}

async function getOrCreateExam(exam: ExamData, collectionId: number): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM toeic_exams WHERE slug = ? LIMIT 1', [exam.slug]);
  if (rows.length) {
    // A7 M1: the schema default is DRAFT. Explicitly (re)publish fixtures so a
    // pre-A7 database that is re-seeded ends with usable public exams.
    await pool.query('UPDATE toeic_exams SET status = ? WHERE id = ?', ['PUBLISHED', rows[0].id]);
    return rows[0].id as number;
  }

  const [result] = await pool.query(
    `INSERT INTO toeic_exams (collection_id, slug, title, duration_minutes, question_count, skill_type, status, published_version)
     VALUES (?, ?, ?, ?, ?, ?, 'PUBLISHED', 1)`,
    [collectionId, exam.slug, exam.title, exam.durationMinutes, exam.questionCount, exam.skillType]
  );
  return (result as { insertId: number }).insertId;
}

async function getOrCreateSection(
  examId: number,
  title: string,
  instructions: string,
  orderIndex: number
): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM toeic_exam_sections WHERE exam_id = ? AND order_index = ? LIMIT 1',
    [examId, orderIndex]
  );
  if (rows.length) return rows[0].id as number;

  const [result] = await pool.query(
    'INSERT INTO toeic_exam_sections (exam_id, title, instructions, order_index) VALUES (?, ?, ?, ?)',
    [examId, title, instructions, orderIndex]
  );
  return (result as { insertId: number }).insertId;
}

async function getOrCreateQuestion(
  sectionId: number,
  type: string,
  order: number,
  content: string
): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM toeic_questions WHERE section_id = ? AND order_index = ? LIMIT 1',
    [sectionId, order]
  );
  if (rows.length) return rows[0].id as number;

  const [result] = await pool.query(
    'INSERT INTO toeic_questions (section_id, type, order_index, content) VALUES (?, ?, ?, ?)',
    [sectionId, type, order, content]
  );
  return (result as { insertId: number }).insertId;
}

async function getOrCreateOption(
  questionId: number,
  label: string,
  content: string,
  orderIndex: number
): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM toeic_question_options WHERE question_id = ? AND order_index = ? LIMIT 1',
    [questionId, orderIndex]
  );
  if (rows.length) return rows[0].id as number;

  const [result] = await pool.query(
    'INSERT INTO toeic_question_options (question_id, label, content, order_index) VALUES (?, ?, ?, ?)',
    [questionId, label, content, orderIndex]
  );
  return (result as { insertId: number }).insertId;
}

async function upsertReviewContent(
  questionId: number,
  review: ReviewContent,
  correctOptionId: number | null = null
): Promise<void> {
  await pool.query(
    `INSERT INTO toeic_question_review_content (question_id, correct_option_id, explanation, sample_response, rubric)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       correct_option_id = VALUES(correct_option_id),
       explanation = VALUES(explanation),
       sample_response = VALUES(sample_response),
       rubric = VALUES(rubric)`,
    [
      questionId,
      correctOptionId,
      review.explanation ?? null,
      review.sampleResponse ?? null,
      review.rubric ?? null,
    ]
  );
}

// ---------------------------------------------------------------------------
// A7 M2: dev/test-only known admin membership
// ---------------------------------------------------------------------------

/**
 * Grants the seed owner account a row in admin_users (idempotent INSERT IGNORE)
 * so a fresh dev/test DB has a working admin. Guarded by NODE_ENV: production
 * is never auto-granted, even if the double gate in seed() is force-engaged.
 * Production admins are provisioned manually via documented SQL — see
 * docs/05-runbook.md — never with this known dev credential.
 */
export async function ensureDevAdminMembership(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [USERS[0].email]
  );
  if (!rows.length) return;
  await pool.query('INSERT IGNORE INTO admin_users (user_id, role) VALUES (?, ?)', [rows[0].id, 'ADMIN']);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  // Production guard (double gate, fail-closed): the seed is a dev fixture —
  // refuse to touch a production DB unless BOTH the ALLOW_PRODUCTION_SEED=1 env
  // gate AND the explicit --force flag are present. Development/test: no gate.
  if (process.env.NODE_ENV === 'production') {
    const envGate = process.env.ALLOW_PRODUCTION_SEED === '1';
    const flagGate = process.argv.includes('--force');
    if (!(envGate && flagGate)) {
      throw new Error(
        'Refusing to seed in production. Required: ALLOW_PRODUCTION_SEED=1 (env) AND --force (argv).'
      );
    }
  }

  for (const user of USERS) {
    await getOrCreateUser(user.email, user.displayName);
  }

  // A7 M2: dev/test-only admin for the seed owner (no-op in production).
  await ensureDevAdminMembership();

  const collectionId = await getOrCreateCollection(COLLECTIONS[0].title, COLLECTIONS[0].slug);

  for (const exam of EXAMS) {
    const examId = await getOrCreateExam(exam, collectionId);

    for (let s = 0; s < exam.sections.length; s++) {
      const section = exam.sections[s];
      const sectionOrder = s + 1; // 1-based part position (LR Parts 1–7, SW 1–2)
      const sectionId = await getOrCreateSection(examId, section.title, section.instructions, sectionOrder);

      for (const q of section.questions) {
        const questionId = await getOrCreateQuestion(sectionId, q.type, q.order, q.content);

        // Apply synthetic media / timed-prompt metadata (columns from 002).
        // URIs derive from the stable question id, so re-runs write identical bytes.
        const updates: string[] = [];
        const params: Array<string | number> = [];
        if (q.media === 'image' || q.media === 'image_audio') {
          updates.push('image_url = ?');
          params.push(svgDataUri(questionId));
        }
        if (q.media === 'audio' || q.media === 'image_audio') {
          updates.push('audio_url = ?');
          params.push(wavDataUri(questionId));
        }
        if (q.minWords !== undefined) {
          updates.push('min_words = ?');
          params.push(q.minWords);
        }
        if (q.prepTimeSeconds !== undefined) {
          updates.push('prep_time_seconds = ?');
          params.push(q.prepTimeSeconds);
        }
        if (q.recordTimeSeconds !== undefined) {
          updates.push('record_time_seconds = ?');
          params.push(q.recordTimeSeconds);
        }
        if (updates.length) {
          params.push(questionId);
          await pool.query(`UPDATE toeic_questions SET ${updates.join(', ')} WHERE id = ?`, params);
        }

        if (q.options && q.correctIndex !== undefined) {
          const optionIds: number[] = [];
          const labels = ['A', 'B', 'C', 'D'];
          for (let i = 0; i < q.options.length; i++) {
            const optionId = await getOrCreateOption(questionId, labels[i], q.options[i], i + 1);
            optionIds.push(optionId);
          }
          const correctOptionId = optionIds[q.correctIndex];
          await upsertReviewContent(questionId, q.review, correctOptionId);
        } else {
          await upsertReviewContent(questionId, q.review);
        }
      }
    }
  }

  console.log('Seed completed.');
}

if (require.main === module) {
  seed()
    .then(() => {
      pool.end();
    })
    .catch((err: unknown) => {
      console.error('Seed failed:', err instanceof Error ? err.message : err);
      pool.end().finally(() => process.exit(1));
    });
}
