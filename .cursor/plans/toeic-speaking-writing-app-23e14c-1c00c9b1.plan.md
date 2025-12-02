<!-- 1c00c9b1-2b04-40b4-b129-1c2d43563712 7271c27b-f419-4adf-8a8b-fd954752cce0 -->
# TOEIC Speaking & Writing Web App Implementation Plan

## Project Structure

```
app/
├── layout.tsx                 # Global layout, fonts, dark theme
├── page.tsx                   # Main page with Speaking/Writing tabs
├── api/
│   ├── grade-speaking/
│   │   └── route.ts          # Gemini API for Speaking grading
│   ├── grade-writing/
│   │   └── route.ts          # Gemini API for Writing grading
│   └── transcribe/
│       └── route.ts          # Audio transcription (Gemini native)
├── components/
│   ├── ui/                    # shadcn/ui components (tabs, cards, buttons)
│   ├── speaking/
│   │   ├── SpeakingTab.tsx
│   │   ├── QuestionStepper.tsx
│   │   ├── AudioRecorder.tsx
│   │   ├── Timer.tsx
│   │   └── SpeakingResults.tsx
│   ├── writing/
│   │   ├── WritingTab.tsx
│   │   ├── WordCountEditor.tsx
│   │   ├── QuestionNavigator.tsx
│   │   └── WritingResults.tsx
│   └── shared/
│       ├── ResultCard.tsx
│       ├── RubricCard.tsx
│       └── ProgressBar.tsx
└── lib/
    ├── gemini.ts              # Gemini client setup
    ├── types.ts               # TypeScript interfaces
    └── mockData.ts            # Mock TOEIC questions/data
```

## Implementation Steps

### Phase 1: Project Setup & Foundation

1. **Initialize Next.js project**

   - Create Next.js 14+ app with TypeScript
   - Install dependencies: `@google/generative-ai`, `tailwindcss`, `lucide-react`
   - Set up shadcn/ui (optional but recommended for cards, tabs, buttons)
   - Configure Tailwind with dark theme colors

2. **Environment setup**

   - Create `.env.local` with `GEMINI_API_KEY`
   - Create `.env.example` template

3. **Global layout & styling**

   - `app/layout.tsx`: Deep navy background (#021B3A) with subtle grid pattern
   - Implement grid background using CSS `repeating-linear-gradient` (5-8% opacity)
   - Set up fonts (Inter or Plus Jakarta Sans)
   - Define ANISH TOEIC brand colors in Tailwind config (brand-bg, brand-primary, brand-secondary, brand-accent, etc.)
   - Create header with ANISH TOEIC logo + "Speaking & Writing Lab" text
   - Glassmorphism top bar with gradient blur
   - Typography: uppercase titles with increased letter-spacing

### Phase 2: Core Components & UI Framework

4. **Shared UI components**

   - `components/ui/`: Install/configure shadcn components (Card, Button, Tabs, Input, Textarea)
   - Customize components with ANISH TOEIC brand styling:
     - Tabs: Pill-shaped, gradient active state with glow
     - Buttons: Primary (gradient + 3D effect), Secondary (outlined)
     - Cards: `rounded-2xl`, `border-white/5`, `bg-brand-card/90`, shadow
   - `components/shared/Timer.tsx`: Countdown timer with pulsing glow when <10s remaining
   - `components/shared/ProgressBar.tsx`: Animated progress bar with smooth transitions
   - Install Framer Motion for animations

5. **Type definitions**

   - `lib/types.ts`: Define interfaces for:
     - SpeakingQuestion, WritingQuestion
     - SpeakingAnswer, WritingAnswer
     - GradingResponse (Speaking & Writing)
     - Criteria scores, feedback structures

6. **Mock data**

   - `lib/mockData.ts`: Create realistic TOEIC-style questions:
     - Speaking: 11 questions across 6 parts with prompts
     - Writing: 8 questions (5 picture descriptions, 1 email, 2 essays)
     - Include placeholder images or image URLs

### Phase 3: Speaking Module Implementation

7. **Speaking tab structure**

   - `components/speaking/SpeakingTab.tsx`: Main container
   - Header: "TOEIC Speaking Test" with gradient, total time, progress
   - Two-column layout: left (prompt area), right (recording controls)

8. **Question stepper**

   - `components/speaking/QuestionStepper.tsx`: Horizontal/vertical step indicator
   - Shows 6 parts with current step highlighted
   - Clickable navigation between parts/questions

9. **Audio recording**

   - `components/speaking/AudioRecorder.tsx`:
     - MediaRecorder API integration
     - Circular microphone button with gradient and glow
     - Recording state: button turns red/brand-accent, outer ring pulses (CSS keyframes)
     - "REC" indicator with blinking dot
     - Live timer display with pulsing glow when <10s remaining
     - Playback functionality after recording
     - Store audio as Blob, convert to base64 for API
     - Handle different recording durations per question type
     - Smooth animations using Framer Motion

10. **Speaking question flow**

    - Render appropriate UI per part:
      - Part 1-2: Text passage or image display
      - Part 3-4: Question text + info table
      - Part 5-6: Problem/topic text + preparation timer
    - Auto-advance or manual navigation
    - State management: track recorded answers per question
    - "Finish Speaking Test" button with validation

### Phase 4: Writing Module Implementation

11. **Writing tab structure**

    - `components/writing/WritingTab.tsx`: Main container
    - Header: "TOEIC Writing Test" with 60-minute countdown timer
    - Progress bar showing time usage

12. **Question navigator**

    - `components/writing/QuestionNavigator.tsx`: Sidebar or top bar
    - List of Q1-Q8 with status indicators (Not started/In progress/Completed)
    - Click to jump to question

13. **Text editor**

    - `components/writing/WordCountEditor.tsx`:
    - Styled textarea with slightly lighter background than page
    - Live word count display (pinned bottom-right with subtle background)
    - Minimum word requirement indicator: warning color + shake animation when below minimum and user tries to submit
    - Auto-save to localStorage per question
    - "Draft saved at HH:MM" message
    - Smooth transitions for all interactions

14. **Writing question flow**

    - Part 1: Image + text input (Q1-5)
    - Part 2: Email prompt + larger textarea (Q6, min 50-60 words)
    - Part 3: Essay prompt + large textarea (Q7-8, min 150-200 words)
    - Navigation between questions
    - "Finish Writing Test" button with validation modal

### Phase 5: Gemini API Integration

15. **Gemini client setup**

    - `lib/gemini.ts`: Initialize Google Generative AI client
    - Helper functions for API calls

16. **Transcription endpoint**

    - `app/api/transcribe/route.ts`:
    - Accept audio (base64 or blob)
    - Use Gemini native audio API for transcription
    - Return transcript text

17. **Speaking grading endpoint**

    - `app/api/grade-speaking/route.ts`:
    - Accept POST with answers array (questionId, questionType, questionText, audio/transcript)
    - For each answer: call transcription if needed
    - Construct comprehensive prompt with:
      - TOEIC Speaking rubrics (Pronunciation, Intonation, Grammar, Vocabulary, Content, Fluency)
      - 0-200 scoring scale
      - Request structured JSON output
    - Return: overallScore, criteria scores, strengths, weaknesses, improvementTips, perQuestionFeedback with transcripts

18. **Writing grading endpoint**

    - `app/api/grade-writing/route.ts`:
    - Accept POST with parts structure (part1, part2, part3)
    - Construct prompt with:
      - TOEIC Writing rubrics (Grammar, Vocabulary Range, Organization, Task Fulfillment)
      - 0-200 scoring scale
      - Request structured JSON with error highlighting
    - Return: overallScore, criteria scores, strengths, weaknesses, improvementTips, perPartFeedback, highlightedAnswers

### Phase 6: Results Display

19. **Speaking results**

    - `components/speaking/SpeakingResults.tsx`:
    - Overall score display: scales from 0.9→1 with spring animation on load
    - Transcript section: collapsible cards per question with transcript text, gradient header strip
    - Criteria grid: 6 cards (Pronunciation, Intonation, Grammar, Vocabulary, Content, Fluency)
      - Each card: gradient header strip or corner badge, score + 2-3 line explanation
      - Stagger animation: 0.05-0.07s delay between cards
      - Color coding: success (#23D997) for strong, warning (#F59E0B) for weak (elegant, not flooded with red)
    - Three feedback sections with gradient headers:
      - "Điểm mạnh" (Strengths) - success color accents, "GOOD" badge
      - "Điểm yếu" (Weaknesses) - warning color accents
      - "Gợi ý cải thiện" (Suggestions) - blue/purple gradient
    - Per-question feedback cards with subtle dividers

20. **Writing results**

    - `components/writing/WritingResults.tsx`:
    - Overall score display: scales from 0.9→1 with spring animation on load
    - Criteria grid: 4 cards (Grammar, Vocabulary, Organization, Task Fulfillment)
      - Stagger animation: 0.05-0.07s delay between cards
      - Gradient header strips or corner badges
    - Three feedback sections (same style as Speaking with gradient headers)
    - Per-part feedback cards
    - Highlighted answers: show original text with wavy underline (`text-decoration-style: wavy`) in soft red
      - Hover tooltip with error type and explanation (small tooltip component)
      - Smooth transitions for hover states

### Phase 7: Polish & Refinement

21. **UI/UX enhancements & brand integration**

    - Apply ANISH TOEIC gradient headers to all major sections (brand-primary → brand-secondary)
    - Implement grid pattern background using CSS
    - Ensure consistent spacing, border-radius (rounded-2xl), shadows matching brand
    - Add hover/focus states: scale 1→1.03, increased glow, smooth transitions
    - Button active states: quick scale down (0.97) then back to 1
    - Icons from lucide-react for visual clarity
    - Tab transitions: fade + slide (opacity 0→1, y: 10→0) using Framer Motion
    - Question stepper: gradient-filled circles for current step, gradient progress line
    - Responsive design: mobile-friendly tabs (full-width), stacked cards, reduced padding
    - Ensure accessibility: contrast meets WCAG standards, readable text on dark backgrounds

22. **State management**

    - Use React Context for exam state (current question, answers, timer state)
    - Clean separation: SpeakingContext, WritingContext
    - Persist answers to localStorage for recovery

23. **Error handling & loading states**

    - Loading spinners during API calls
    - Error messages for failed recordings, API errors
    - Validation before submitting (ensure required questions answered)

24. **Code organization**

    - Refactor large components into smaller, reusable pieces
    - Extract constants (question types, timings, rubrics)
    - Type safety throughout with TypeScript
    - Clean, commented code

## Key Files to Create

**Core App Files:**

- `app/layout.tsx` - Global layout with ANISH TOEIC brand theme, grid background, header with logo
- `app/page.tsx` - Main page with tab navigation, Assessment Setup panel, main content area
- `tailwind.config.ts` - ANISH TOEIC brand color palette configuration
- `app/globals.css` - Grid pattern background, custom animations (pulse, shake, etc.)

**API Routes:**

- `app/api/grade-speaking/route.ts` - Speaking grading logic
- `app/api/grade-writing/route.ts` - Writing grading logic
- `app/api/transcribe/route.ts` - Audio transcription

**Components:**

- `components/speaking/SpeakingTab.tsx`
- `components/speaking/AudioRecorder.tsx`
- `components/speaking/QuestionStepper.tsx`
- `components/speaking/SpeakingResults.tsx`
- `components/writing/WritingTab.tsx`
- `components/writing/WordCountEditor.tsx`
- `components/writing/WritingResults.tsx`
- `components/shared/Timer.tsx` - With pulsing glow animation
- `components/shared/ResultCard.tsx` - With gradient headers, stagger animations
- `components/shared/RubricCard.tsx` - With corner badges, color coding
- `components/shared/Header.tsx` - ANISH TOEIC header with logo and glassmorphism bar

**Utilities:**

- `lib/gemini.ts` - Gemini client
- `lib/types.ts` - TypeScript interfaces
- `lib/mockData.ts` - Mock exam data
- `lib/animations.ts` - Framer Motion animation variants (fade, slide, stagger, etc.)

## Design System - ANISH TOEIC Brand

### Color Palette

- **Background**: Deep navy (#021B3A) with subtle grid pattern (5-8% opacity)
- **Brand Colors**:
  - `brand-bg`: #021B3A (main background)
  - `brand-bg-alt`: #032753 (lighter sections)
  - `brand-grid`: #0B2F63 (grid lines)
  - `brand-primary`: #1D8CFF (bright blue accents)
  - `brand-secondary`: #4ED0FF (cyan highlights)
  - `brand-accent`: #7C5CFF (purple-blue, buttons/active tabs)
  - `brand-card`: #061E3F (card backgrounds)
  - `text-primary`: #FFFFFF
  - `text-muted`: #9FB4D9
  - `success`: #23D997 (strengths)
  - `warning`: #F59E0B (weaknesses)
  - `error`: #F97373

### Typography

- Font: Clean sans-serif (Inter or Plus Jakarta Sans)
- Titles: Uppercase/semi-uppercase, increased letter-spacing
- H1: 24-32px, bold
- Section titles: 18-20px, semibold
- Body: 14-16px, regular

### Layout

- Dashboard-style: Left column (Assessment Setup), Right column (main content)
- Cards: `rounded-2xl`, `border border-white/5`, `bg-brand-card/90`, `shadow-[0_18px_45px_rgba(0,0,0,0.45)]`
- 12-column grid on desktop, stacked on mobile

### Component Styling

- **Tabs**: Pill-shaped, inactive (transparent), active (gradient bg with glow)
- **Buttons**: Primary (gradient + 3D effect), Secondary (outlined)
- **Cards**: Gradient header strip or corner badge, subtle dividers
- **Highlights**: Strengths (green), Weaknesses (amber), Suggestions (blue/purple gradient)

### Animations & Interactions

- Use Framer Motion for micro-interactions
- All interactive: `transition-all duration-200`, hover scale/translate
- Tab transitions: fade + slide
- Results: score card scales in, rubric cards stagger
- Timer: pulsing glow when <10s remaining
- Audio recorder: pulsing ring during recording, "REC" indicator
- Word count: shake animation when below minimum

### Branding

- Header: ANISH TOEIC logo + "Speaking & Writing Lab"
- Glassmorphism top bar with gradient blur
- Optional: up-arrow watermark in content area (low opacity)
- Grid pattern background using CSS repeating-linear-gradient

## Testing Considerations

- Test audio recording across browsers
- Verify timer accuracy and auto-stop functionality
- Test API integration with real Gemini responses
- Validate word count logic for Writing module
- Check localStorage persistence
- Test responsive layouts on mobile devices
- Verify animations are smooth and performant
- Test grid pattern background renders correctly
- Ensure brand colors meet accessibility contrast requirements

### To-dos

- [ ] Initialize Next.js 14+ project with TypeScript, install dependencies (Tailwind, Gemini SDK, shadcn/ui), configure environment variables
- [ ] Create app/layout.tsx with dark theme, fonts, and global styling. Set up Tailwind config with dark color palette
- [ ] Create lib/types.ts with TypeScript interfaces for questions, answers, grading responses, and all data structures
- [ ] Create lib/mockData.ts with realistic TOEIC-style questions for Speaking (11 questions) and Writing (8 questions)
- [ ] Build shared UI components: Timer, ProgressBar, ResultCard, RubricCard. Set up shadcn/ui components (Card, Button, Tabs)
- [ ] Implement SpeakingTab with question stepper, prompt display area, and navigation. Create QuestionStepper component
- [ ] Build AudioRecorder component with MediaRecorder API, timer display, start/stop controls, and playback functionality
- [ ] Implement complete Speaking exam flow: handle all 6 parts with appropriate timers, preparation phases, and state management
- [ ] Implement WritingTab with 60-minute timer, question navigator, and main content area
- [ ] Build WordCountEditor component with live word count, minimum requirement indicators, and localStorage auto-save
- [ ] Implement complete Writing exam flow: handle all 3 parts (picture descriptions, email, essays) with navigation and validation
- [ ] Create lib/gemini.ts with Gemini client setup and helper functions
- [ ] Implement app/api/transcribe/route.ts using Gemini native audio API for transcription
- [ ] Create app/api/grade-speaking/route.ts with comprehensive prompt engineering for TOEIC Speaking rubrics, return structured JSON
- [ ] Create app/api/grade-writing/route.ts with comprehensive prompt engineering for TOEIC Writing rubrics, return structured JSON with error highlighting
- [ ] Build SpeakingResults component: overall score, transcript cards, criteria grid (6 cards), strengths/weaknesses/suggestions sections
- [ ] Build WritingResults component: overall score, criteria grid (4 cards), strengths/weaknesses/suggestions, highlighted error display
- [ ] Create app/page.tsx with tab navigation between Speaking and Writing, Assessment Setup panel, and main content area
- [ ] Implement React Context for exam state management (SpeakingContext, WritingContext) with localStorage persistence
- [ ] Apply gradient headers, consistent spacing, hover states, icons, and responsive design. Ensure elegant, professional appearance