export interface ChatDto {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
}
