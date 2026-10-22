export type Identity = '' | 'human' | 'agent';
export type TimeMode = 'auto' | 'manual';

export interface ManualTime {
  date: string;
  hour: string;
  minute: string;
}

export interface WizardState {
  identity: Identity;
  url: string;
  timeMode: TimeMode;
  manualTime: ManualTime;
}

export interface ToastState {
  title?: string;
  message: string;
  type: 'error' | 'success' | 'notice';
}

export interface QrResult {
  imageUrl?: string;
  generatedTime?: string;
  validTime?: string;
  message?: string;
}
