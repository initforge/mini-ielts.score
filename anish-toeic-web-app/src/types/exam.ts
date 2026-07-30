export interface Section {
  id: number;
  exam_id: number;
  order_index: number;
  title?: string;
  description?: string;
  part_type?: string;
  instructions?: string;
}

export interface Question {
  id: number;
  section_id: number;
  type: string;
  order_index: number;
  content: string;
  audio_url: string;
  image_url: string;
  // mapped locally
  displayNumber?: number; 
}

export interface Option {
  id: number;
  question_id: number;
  label: string;
  content: string;
  order_index: number;
}

export interface ResponseRecord {
  question_id: number;
  selected_option_id: number | null;
  text_response: string | null;
  marked_for_review: boolean;
  note: string | null;
  client_revision: number;
}

export interface Attempt {
  id: number;
  user_id: string;
  exam_id: number;
  status: string;
  started_at: string;
  updated_at: string;
  responses: ResponseRecord[];
  session: {
    sections: Section[];
    questions: Question[];
    options: Option[];
  };
}
