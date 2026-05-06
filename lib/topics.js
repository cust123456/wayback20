const TOPIC_RULES = [
  { label: 'Gambling', keywords: ['casino', 'slot', 'slots', 'bet', 'betting', 'sportsbook', 'poker', 'blackjack', 'roulette', 'jackpot', 'baccarat', 'wager', 'odds', 'bookmaker', 'gambling'] },
  { label: 'Adult', keywords: ['porn', 'xxx', 'sex', 'escort', 'camgirl', 'cams', 'adult video', 'nsfw', 'erotic', 'fetish', 'nude'] },
  { label: 'Pharma', keywords: ['pharmacy', 'pharma', 'levitra', 'cialis', 'viagra', 'tramadol', 'xanax', 'medication', 'prescription', 'pill', 'pills', 'drugstore'] },
  { label: 'Crypto', keywords: ['crypto', 'blockchain', 'bitcoin', 'ethereum', 'token', 'defi', 'nft', 'web3'] },
  { label: 'Shop', keywords: ['buy now', 'shop', 'store', 'cart', 'checkout', 'discount', 'product', 'products'] },
  { label: 'Tech', keywords: ['software', 'hosting', 'cloud', 'app', 'developer', 'saas', 'technology'] },
  { label: 'Blog', keywords: ['blog', 'article', 'news', 'editorial', 'post', 'posts'] },
];

export function classifyTopics(text = '') {
  const normalized = String(text).toLowerCase();
  const matches = [];

  for (const rule of TOPIC_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      matches.push(rule.label);
    }
  }

  return matches;
}
