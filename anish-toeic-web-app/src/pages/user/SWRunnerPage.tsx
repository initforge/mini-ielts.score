import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button, Layout, Typography, Space, Progress, message, Input } from 'antd';
import { AudioOutlined, SoundOutlined, ArrowLeftOutlined, ArrowRightOutlined, CloseOutlined } from '@ant-design/icons';

// Simple debounce
function debounce<A extends unknown[]>(func: (...args: A) => void, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// Mock data
const QUESTIONS = [
  { id: 's1', type: 'speaking', title: 'Questions 1 - 2: Read a text aloud', prepTime: 45, recordTime: 45, content: 'In this part of the test, you will read aloud the text on the screen.' },
  { id: 's2', type: 'speaking', title: 'Question 3 — Describe a Picture', prepTime: 45, recordTime: 45, image: 'https://placehold.co/400x300', content: 'Describe the picture on your screen in as much detail as you can.' },
  { id: 'w1', type: 'writing', title: 'Questions 1–5: Write a sentence based on a picture', content: 'Write ONE sentence based on the picture using the TWO words or phrases provided.' },
  { id: 'w2', type: 'writing', title: 'Question 8: Write an opinion essay', content: 'Write an essay in response to a specific opinion or issue.' },
];

export default function SWRunnerPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  
  const [phase, setPhase] = useState<'mic_check' | 'speaking_dir' | 'speaking' | 'writing_dir' | 'writing'>('mic_check');
  const [questionIndex, setQuestionIndex] = useState(0);
  
  const [speakingState, setSpeakingState] = useState<'prep' | 'recording'>('prep');
  const [timeLeft, setTimeLeft] = useState(0);
  
  const [micGranted, setMicGranted] = useState(false);
  const [micTesting, setMicTesting] = useState(false);
  
  const [responses, setResponses] = useState<Record<string, string>>({});

  const currentQ = QUESTIONS[questionIndex];

  const handleSubmit = useCallback(async () => {
    try {
      if (attemptId) {
        await fetch(`/api/toeic-attempts/${attemptId}/submit`, {
          method: 'POST',
        });
      }
      navigate(`/thi-thu/dang-xu-ly/${attemptId || 'demo'}`);
    } catch (err) {
      message.error('Failed to submit');
    }
  }, [attemptId, navigate]);

  const handleNext = useCallback(() => {
    if (phase === 'mic_check') setPhase('speaking_dir');
    else if (phase === 'speaking_dir') {
      setPhase('speaking');
      setQuestionIndex(0);
      setSpeakingState('prep');
      setTimeLeft(QUESTIONS[0].prepTime || 45);
    }
    else if (phase === 'speaking') {
      const nextIndex = questionIndex + 1;
      if (nextIndex < QUESTIONS.length && QUESTIONS[nextIndex].type === 'speaking') {
        setQuestionIndex(nextIndex);
        setSpeakingState('prep');
        setTimeLeft(QUESTIONS[nextIndex].prepTime || 45);
      } else {
        setPhase('writing_dir');
      }
    }
    else if (phase === 'writing_dir') {
      setPhase('writing');
      const firstW = QUESTIONS.findIndex(q => q.type === 'writing');
      setQuestionIndex(firstW);
    }
    else if (phase === 'writing') {
      const nextIndex = questionIndex + 1;
      if (nextIndex < QUESTIONS.length) {
        setQuestionIndex(nextIndex);
      } else {
        handleSubmit();
      }
    }
  }, [phase, questionIndex, handleSubmit]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if ((phase === 'speaking' || phase === 'mic_check') && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (phase === 'speaking' && timeLeft === 0) {
      if (speakingState === 'prep') {
        setSpeakingState('recording');
        setTimeLeft(QUESTIONS[questionIndex].recordTime || 45);
      } else {
        handleNext();
      }
    }
    return () => clearInterval(timer);
  }, [timeLeft, phase, speakingState, questionIndex, handleNext]);

  const requestMic = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicGranted(true);
    } catch (err) {
      message.error('Microphone access denied. Please allow it to continue.');
    }
  };

  const startMicTest = () => {
    setMicTesting(true);
    setTimeLeft(5); // 5 sec test
    setTimeout(() => {
      setMicTesting(false);
      message.success('Microphone test completed!');
    }, 5000);
  };

  const handlePrev = () => {
    if (questionIndex > 0) {
      setQuestionIndex(questionIndex - 1);
    }
  };

  // Debounced autosave
  const debouncedSave = useRef(
    debounce(async (qId: string, val: string) => {
      if (!attemptId) return;
      try {
        await fetch(`/api/toeic-attempts/${attemptId}/responses/${qId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: val }),
        });
      } catch (err) {
        console.error('Autosave failed', err);
      }
    }, 1000)
  ).current;

  const handleWritingChange = (val: string) => {
    setResponses(prev => ({ ...prev, [currentQ.id]: val }));
    debouncedSave(currentQ.id, val);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `00:${m}:${s}`;
  };

  return (
    <Layout className="min-h-screen bg-gray-50">
      <Header className="bg-white border-b px-4 flex items-center justify-between h-14 shadow-sm">
        <Space>
          <Link to="/exams" className="text-blue-600 hover:underline">Danh sách đề</Link>
          <Text className="text-gray-400">|</Text>
          <Text strong>XoáMùTOEIC</Text>
        </Space>
        
        {phase === 'speaking' || phase === 'writing' ? (
          <Space size="large">
            <Text className="font-semibold">{phase === 'speaking' ? 'SPEAKING' : 'WRITING'}</Text>
            <Text className="text-gray-500">Question {questionIndex + 1} of {QUESTIONS.length}</Text>
          </Space>
        ) : null}

        <Space size="middle">
          <Button icon={<SoundOutlined />} />
          <Button icon={<ArrowLeftOutlined />} onClick={handlePrev} disabled={questionIndex === 0} />
          <Button icon={<ArrowRightOutlined />} type="primary" onClick={handleNext}>Next</Button>
          <Button icon={<CloseOutlined />} danger onClick={() => navigate('/thi-thu')} />
        </Space>
      </Header>

      <Content className="flex flex-col items-center p-8">
        {phase === 'mic_check' && (
          <div className="w-full max-w-2xl bg-white p-8 rounded-lg shadow text-center">
            <Title level={2}>Microphone Setup</Title>
            <Paragraph className="mb-8">
              Before starting the Speaking test, we need to check your microphone.
            </Paragraph>
            {!micGranted ? (
              <Button type="primary" size="large" onClick={requestMic} icon={<AudioOutlined />}>
                Allow Microphone Access
              </Button>
            ) : (
              <Space direction="vertical" size="large" className="w-full">
                <Text type="success" className="text-lg">Microphone access granted!</Text>
                <Button loading={micTesting} onClick={startMicTest} size="large">
                  {micTesting ? `Recording... (${timeLeft}s)` : 'Test Microphone'}
                </Button>
                {timeLeft === 0 && !micTesting && (
                  <Button type="primary" size="large" onClick={handleNext}>Continue to Test</Button>
                )}
              </Space>
            )}
          </div>
        )}

        {phase === 'speaking_dir' && (
          <div className="w-full max-w-3xl bg-white p-10 rounded-lg shadow">
            <Title level={1} className="text-center mb-8">DIRECTIONS</Title>
            <Title level={2}>Questions 1 - 2: Read a text aloud</Title>
            <Paragraph className="text-lg leading-relaxed mt-4">
              In this part of the test, you will read aloud the text on the screen. 
              You will have 45 seconds to prepare. Then you will have 45 seconds to read the text aloud.
            </Paragraph>
            <div className="text-center mt-12">
              <Button type="primary" size="large" onClick={handleNext}>BẮT ĐẦU</Button>
            </div>
          </div>
        )}

        {phase === 'speaking' && (
          <div className="w-full max-w-3xl bg-white p-8 rounded-lg shadow flex flex-col items-center">
            {currentQ.image && (
              <img src={currentQ.image} alt="Question prompt" className="max-w-full h-64 object-contain mb-6" />
            )}
            <Title level={4}>{currentQ.title}</Title>
            <Paragraph className="text-lg text-center my-6">{currentQ.content}</Paragraph>

            <div className="mt-8 p-6 bg-gray-50 rounded-lg w-full max-w-md text-center border">
              <Title level={3} className={speakingState === 'recording' ? 'text-red-500' : 'text-blue-500'}>
                {speakingState === 'prep' ? 'PREPARATION TIME' : 'RECORDING TIME'}
              </Title>
              <div className="text-4xl font-mono mt-4 font-bold">{formatTime(timeLeft)}</div>
              <Progress 
                percent={(timeLeft / (currentQ.recordTime || 45)) * 100} 
                showInfo={false} 
                status={speakingState === 'recording' ? 'exception' : 'active'}
                className="mt-4"
              />
            </div>
          </div>
        )}

        {phase === 'writing_dir' && (
          <div className="w-full max-w-3xl bg-white p-10 rounded-lg shadow">
            <Title level={1} className="text-center mb-8">WRITING TEST DIRECTIONS</Title>
            <Paragraph className="text-lg leading-relaxed mt-4">
              This is the TOEIC Writing Test. This test includes eight questions that measure different aspects of your writing ability. The test lasts approximately one hour.
            </Paragraph>
            <div className="text-center mt-12">
              <Button type="primary" size="large" onClick={handleNext}>BẮT ĐẦU WRITING</Button>
            </div>
          </div>
        )}

        {phase === 'writing' && (
          <div className="w-full max-w-4xl flex gap-6">
            <div className="flex-1 bg-white p-6 rounded-lg shadow">
              <Title level={4}>{currentQ.title}</Title>
              <Paragraph className="text-lg my-4">{currentQ.content}</Paragraph>
              {currentQ.image && (
                <img src={currentQ.image} alt="Question prompt" className="max-w-full h-48 object-contain my-4" />
              )}
            </div>
            <div className="flex-1 bg-white p-6 rounded-lg shadow flex flex-col">
              <Title level={5} className="mb-4">Your Response:</Title>
              <TextArea
                rows={12}
                value={responses[currentQ.id] || ''}
                onChange={e => handleWritingChange(e.target.value)}
                className="flex-1 text-lg"
                placeholder="Type your answer here..."
              />
              <div className="text-right mt-2 text-gray-500">
                Word count: {(responses[currentQ.id] || '').split(/\s+/).filter(Boolean).length}
              </div>
            </div>
          </div>
        )}
      </Content>
    </Layout>
  );
}
