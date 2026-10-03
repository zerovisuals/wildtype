// Emoji groups + the keywords that call them up.
// Single-codepoint emojis only, so every one maps to a clean Apple glyph in public/emoji.

export type Group = { id: string; emojis: string[]; words: string[] };

/** Common, good-looking fallback when the text gives no context. */
export const COMMON = ['🌸', '🎉', '☕', '🌈', '🍓', '🎈', '🌻', '🦋', '🍩', '🎧', '📸', '🌙', '☀️', '🍕', '🪴', '🧸', '🎨', '🍰', '🌊', '🎁'];

export const GROUPS: Group[] = [
  {
    id: 'student',
    emojis: ['📚', '🎒', '✏️', '📝', '☕', '💻', '🎓', '⏰', '🍜', '📐', '🔬', '🧪', '📓', '🖍️'],
    words: ['study', 'studies', 'school', 'class', 'exam', 'test', 'homework', 'college', 'uni', 'university', 'campus', 'lecture', 'notes', 'book', 'read', 'learn', 'teacher', 'professor', 'essay', 'library', 'math', 'science', 'chemistry', 'lab', 'semester', 'grade', 'student', 'assignment', 'quiz', 'thesis'],
  },
  {
    id: 'weekend',
    emojis: ['☕', '🧘', '🚲', '🍷', '🧺', '🌻', '🥐', '🎬', '🛋️', '🍳', '⚽', '🏓', '🎨', '🛼'],
    words: ['weekend', 'saturday', 'sunday', 'relax', 'chill', 'brunch', 'yoga', 'bike', 'picnic', 'movie', 'film', 'netflix', 'sofa', 'couch', 'lazy', 'park', 'wine', 'football', 'soccer', 'paint', 'skate'],
  },
  {
    id: 'travel',
    emojis: ['✈️', '🧳', '🗺️', '🏝️', '⛺', '📸', '🧭', '🚆', '🎟️', '🏔️', '🛶', '🕶️', '🏨', '🌋'],
    words: ['travel', 'trip', 'flight', 'plane', 'fly', 'airport', 'vacation', 'holiday', 'beach', 'island', 'hotel', 'passport', 'camping', 'camp', 'hike', 'mountain', 'train', 'map', 'explore', 'abroad', 'journey', 'suitcase', 'adventure', 'paris', 'tokyo', 'london', 'rome'],
  },
  {
    id: 'money',
    emojis: ['🧮', '💵', '🏧', '💳', '📈', '🪙', '💰', '🧾', '🏦', '💸', '📊', '🐷'],
    words: ['money', 'cash', 'pay', 'paid', 'bank', 'budget', 'rent', 'bill', 'price', 'cost', 'invest', 'stock', 'crypto', 'salary', 'save', 'savings', 'euro', 'dollar', 'buy', 'spend', 'subscription', 'tax', 'card', 'rich', 'broke', 'expensive', 'cheap'],
  },
  {
    id: 'music',
    emojis: ['🎷', '📻', '🥁', '🎤', '🎧', '🎸', '🎹', '🎺', '🎻', '🪗', '💿', '🪩'],
    words: ['music', 'song', 'concert', 'band', 'guitar', 'piano', 'drum', 'sing', 'singer', 'album', 'playlist', 'spotify', 'beat', 'festival', 'jazz', 'rap', 'rock', 'ticket', 'listen', 'radio', 'vinyl', 'gig'],
  },
  {
    id: 'gaming',
    emojis: ['🎮', '🕹️', '👾', '🎲', '🏆', '🃏', '🧩', '🖥️', '⌨️', '🖱️', '🎯', '🪄'],
    words: ['game', 'gaming', 'gamer', 'play', 'player', 'xbox', 'playstation', 'nintendo', 'steam', 'controller', 'level', 'win', 'minecraft', 'fortnite', 'valorant', 'league', 'quest', 'puzzle', 'chess', 'stream', 'twitch', 'pc'],
  },
  {
    id: 'food',
    emojis: ['🍕', '🍔', '🍣', '🌮', '🍩', '🥑', '🍜', '🧁', '🍓', '🥨', '🧀', '🍿', '🍉', '🥐'],
    words: ['food', 'eat', 'eating', 'pizza', 'burger', 'sushi', 'taco', 'lunch', 'dinner', 'breakfast', 'hungry', 'cook', 'cooking', 'recipe', 'snack', 'donut', 'avocado', 'ramen', 'noodle', 'cheese', 'fruit', 'popcorn', 'restaurant', 'delicious', 'yummy', 'kitchen', 'bake', 'strawberry'],
  },
  {
    id: 'work',
    emojis: ['💼', '📎', '📅', '📌', '🗂️', '📞', '✉️', '🖇️', '💡', '🖨️', '📋', '☕'],
    words: ['work', 'job', 'office', 'meeting', 'boss', 'email', 'mail', 'call', 'phone', 'deadline', 'project', 'client', 'team', 'monday', 'schedule', 'calendar', 'task', 'idea', 'report', 'career', 'interview', 'coffee', 'busy'],
  },
  {
    id: 'party',
    emojis: ['🎉', '🎈', '🎂', '🥳', '🪅', '🍾', '🎁', '🪩', '🎊', '🥂', '🍰', '🕺'],
    words: ['party', 'birthday', 'bday', 'celebrate', 'congrats', 'congratulations', 'wedding', 'gift', 'present', 'cheers', 'drink', 'champagne', 'dance', 'club', 'friends', 'fun', 'yay', 'happy', 'cake', 'surprise', 'chat'],
  },
  {
    id: 'nature',
    emojis: ['🌱', '🌸', '🍄', '🌿', '🐝', '🌈', '🌙', '☀️', '🌊', '🦋', '🍂', '🌵'],
    words: ['nature', 'flower', 'plant', 'tree', 'forest', 'sun', 'sunny', 'rain', 'rainbow', 'ocean', 'sea', 'wave', 'moon', 'night', 'spring', 'summer', 'autumn', 'leaf', 'garden', 'bee', 'butterfly', 'cactus', 'mushroom', 'grow', 'green', 'earth', 'sky', 'outside', 'walk'],
  },
];

export const groupEmojis = (id: string) => GROUPS.find((g) => g.id === id)?.emojis ?? COMMON;

/** Codepoint key used for the PNG filename, e.g. "1f3b7". Variation selectors are dropped. */
export function emojiKey(e: string): string {
  return [...e]
    .map((c) => c.codePointAt(0)!)
    .filter((cp) => cp !== 0xfe0f)
    .map((cp) => cp.toString(16))
    .join('-');
}
