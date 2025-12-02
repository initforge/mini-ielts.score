# TOEIC Speaking & Writing Web App

A comprehensive web application for TOEIC Speaking and Writing assessment, powered by Google Gemini AI.

## Features

- **TOEIC Speaking Test**: 11 questions across 6 parts with audio recording and AI-powered grading
- **TOEIC Writing Test**: 8 questions across 3 parts with word count tracking and AI-powered grading
- **Real-time Audio Recording**: Browser-based audio recording with playback functionality
- **AI Grading**: Comprehensive evaluation using Google Gemini AI with detailed feedback
- **Progress Tracking**: Visual progress indicators and question navigation
- **Auto-save**: Automatic saving of answers to localStorage
- **Responsive Design**: Mobile-friendly interface with elegant dark theme

## Prerequisites

- Node.js 18+ and npm
- Google Gemini API key

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file in the root directory:
```
GEMINI_API_KEY=your_gemini_api_key_here
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
app/
├── layout.tsx              # Global layout with header
├── page.tsx                # Main page with tab navigation
├── api/
│   ├── grade-speaking/     # Speaking grading API
│   ├── grade-writing/      # Writing grading API
│   └── transcribe/         # Audio transcription API
├── components/
│   ├── speaking/           # Speaking test components
│   ├── writing/            # Writing test components
│   ├── shared/             # Shared UI components
│   └── ui/                 # Base UI components
├── contexts/               # React Context providers
└── lib/                    # Utilities and types
```

## Usage

### Speaking Test

1. Click "Start Speaking Test"
2. Navigate through questions using the question stepper
3. Record your responses using the microphone button
4. Review your recordings before proceeding
5. Click "Finish Test" when done
6. Click "Get Results" to receive AI-powered feedback

### Writing Test

1. Click "Start Writing Test"
2. Navigate through questions using the question navigator
3. Type your responses in the editor
4. Monitor word count requirements
5. Answers are auto-saved to localStorage
6. Click "Finish Test" when done
7. Click "Get Results" to receive AI-powered feedback

## Technology Stack

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework
- **Framer Motion**: Animation library
- **Google Gemini AI**: AI-powered grading and transcription
- **Lucide React**: Icon library

## Design System

The app uses the ANISH TOEIC brand colors:
- Deep navy background (#021B3A)
- Bright blue accents (#1D8CFF)
- Cyan highlights (#4ED0FF)
- Purple-blue buttons (#7C5CFF)

## License

This project is for educational purposes.
