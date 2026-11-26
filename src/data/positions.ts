import { PlayerCard, Position } from '../types/game';

/**
 * Authentic NBA multi-position versatility map.
 * Applied cleanly across all base cards unless explicitly overridden on the card.
 */
export const SECONDARY_POSITIONS_BY_NAME: Record<string, Position[]> = {
  // Multi-positional superstars & point forwards
  'LeBron James': ['PG', 'SG', 'PF'],
  'Magic Johnson': ['SG', 'SF', 'PF', 'C'],
  'Scottie Pippen': ['PG', 'SG', 'PF'],
  'Larry Bird': ['PF'],
  'Luka Doncic': ['SG', 'SF'],
  'Giannis Antetokounmpo': ['SF', 'C'],
  'Kevin Durant': ['PF', 'SG'],
  'Ben Simmons': ['PF', 'SF', 'C'],
  'Draymond Green': ['C', 'SF'],
  'Boris Diaw': ['C', 'SF', 'PG'],
  'Lamar Odom': ['PF', 'SG'],

  // Versatile Guards (PG/SG)
  'Kyrie Irving': ['SG'],
  'Stephen Curry': ['SG'],
  'James Harden': ['PG', 'SF'],
  'Russell Westbrook': ['SG'],
  'Dwyane Wade': ['PG'],
  'Allen Iverson': ['SG'],
  'Jerry West': ['SG'],
  'Oscar Robertson': ['SG', 'SF'],
  'Penny Hardaway': ['SG', 'SF'],
  'Shai Gilgeous-Alexander': ['SG'],
  'Tyrese Maxey': ['SG'],
  'Donovan Mitchell': ['PG'],
  'Devin Booker': ['PG', 'SF'],
  'Jamal Murray': ['SG'],
  'Jalen Brunson': ['SG'],
  'Damian Lillard': ['SG'],
  'Jason Terry': ['PG'],
  'Joe Dumars': ['PG'],
  'Jrue Holiday': ['SG'],
  'Derrick White': ['PG'],
  'Alex Caruso': ['PG', 'SF'],
  'Marcus Smart': ['SG'],
  'Cade Cunningham': ['SG', 'SF'],
  'LaMelo Ball': ['SG'],
  'DeMar DeRozan': ['SG', 'PF'],
  'Bradley Beal': ['PG'],
  'Zach LaVine': ['PG', 'SF'],
  'Tyler Herro': ['PG'],
  'Malik Monk': ['PG'],
  'Jalen Suggs': ['SG'],
  'Stephon Castle': ['PG', 'SF'],
  'Amen Thompson': ['PG', 'SF', 'PF'],
  'Jalen Williams': ['SG', 'PF'],

  // Versatile Wings (SG/SF & SF/PF)
  'Michael Jordan': ['PG', 'SF'],
  'Kobe Bryant': ['SF', 'PG'],
  'Kawhi Leonard': ['SG', 'PF'],
  'Paul George': ['SG', 'PF'],
  'Jimmy Butler': ['SF', 'SG', 'PG'],
  'Jayson Tatum': ['PF', 'SG'],
  'Jaylen Brown': ['SF', 'PG'],
  'Tracy McGrady': ['SF', 'PG'],
  'Vince Carter': ['SF', 'PF'],
  'Carmelo Anthony': ['PF'],
  'Julius Erving': ['SG', 'PF'],
  'John Havlicek': ['SG', 'PF'],
  'Sam Jones': ['SF'],
  'Hal Greer': ['PG'],
  'Chet Walker': ['PF'],
  'Gail Goodrich': ['PG'],
  'Klay Thompson': ['SF'],
  'Andre Iguodala': ['SG', 'PF'],
  'Khris Middleton': ['SG', 'PF'],
  'Franz Wagner': ['PF', 'SG'],
  'OG Anunoby': ['PF', 'SG'],
  'Mikal Bridges': ['SG', 'PF'],
  'Brandon Ingram': ['PF', 'SG'],
  'Shawn Marion': ['PF'],
  'Peja Stojakovic': ['PF'],
  'James Worthy': ['PF'],
  'Toni Kukoc': ['PF', 'PG'],
  'Detlef Schrempf': ['PF'],
  'Grant Hill': ['SG', 'PF'],
  'Rashard Lewis': ['PF'],
  'Hedo Turkoglu': ['PF', 'PG'],
  'Michael Finley': ['SG'],
  'Ron Harper': ['PG', 'SG'],
  'Danny Green': ['SF'],
  'Desmond Bane': ['SF'],
  'Devin Vassell': ['SG'],
  'Ausar Thompson': ['PF', 'SG'],
  'Andrew Wiggins': ['SG', 'PF'],
  'Josh Hart': ['SF', 'PF'],
  'Luol Deng': ['PF'],
  'Nicolas Batum': ['PF', 'SG'],

  // Versatile Bigs (PF/C & C/PF)
  'Tim Duncan': ['C'],
  'Dirk Nowitzki': ['C'],
  'Chris Bosh': ['C'],
  'Kevin Garnett': ['C', 'SF'],
  'Anthony Davis': ['C'],
  'Victor Wembanyama': ['PF'],
  'Chet Holmgren': ['PF'],
  'Kristaps Porzingis': ['PF'],
  'Karl-Anthony Towns': ['PF'],
  'Bam Adebayo': ['PF'],
  'Jaren Jackson Jr.': ['C'],
  'Evan Mobley': ['C'],
  'Pau Gasol': ['C'],
  'Rasheed Wallace': ['C'],
  'Chris Webber': ['C'],
  'Amar\'e Stoudemire': ['C'],
  'LaMarcus Aldridge': ['C'],
  'Kevin Love': ['C'],
  'Serge Ibaka': ['C'],
  'Paolo Banchero': ['SF', 'C'],
  'Pascal Siakam': ['C', 'SF'],
  'Aaron Gordon': ['SF', 'C'],
  'Julius Randle': ['C'],
  'Al Horford': ['C'],
  'Paul Millsap': ['SF', 'C'],
  'Domantas Sabonis': ['PF'],
  'Nikola Jokic': ['PF'],
  'Alperen Sengun': ['PF'],
  'Bill Laimbeer': ['PF'],
  'Bob Dandridge': ['PF'],
  'Tom Heinsohn': ['C'],
  'Billy Cunningham': ['PF'],
  'Bobby Jones': ['C', 'SF'],
  'Horace Grant': ['C'],
  'Robert Horry': ['SF', 'C'],
  'Dennis Rodman': ['SF', 'C'],
  'Charles Barkley': ['SF'],
  'Shawn Kemp': ['C'],
  'Zion Williamson': ['SF', 'C'],
  'P.J. Washington': ['SF', 'C'],
  'Rui Hachimura': ['SF'],
  'Michael Porter Jr.': ['PF'],
  'Keegan Murray': ['PF'],
  'Miles Bridges': ['SF'],
};

export function getPlayerPositions(card: PlayerCard): Position[] {
  const seen = new Set<Position>([card.pos]);
  for (const sec of card.secondaryPositions ?? []) {
    seen.add(sec);
  }
  return Array.from(seen);
}

export function canPlayPosition(card: PlayerCard, targetPos: Position): boolean {
  if (card.pos === targetPos) return true;
  return Boolean(card.secondaryPositions?.includes(targetPos));
}

export function formatPlayerPositions(card: PlayerCard): string {
  const sec = (card.secondaryPositions ?? []).filter((p) => p !== card.pos);
  if (sec.length === 0) return card.pos;
  return `${card.pos} / ${sec.join('·')}`;
}

export function withSecondaryPositions(card: PlayerCard): PlayerCard {
  if (card.secondaryPositions && card.secondaryPositions.length > 0) {
    return card;
  }
  // Handle special LeBron 2020 LAL PG card cleanly
  if (card.name === 'LeBron James' && card.pos === 'PG') {
    return { ...card, secondaryPositions: ['SG', 'SF', 'PF'] };
  }
  if (card.name === 'Anthony Davis' && card.pos === 'C') {
    return { ...card, secondaryPositions: ['PF'] };
  }
  if (card.name === 'Jalen Brunson' && card.pos === 'SG') {
    return { ...card, secondaryPositions: ['PG'] };
  }
  if (card.name === 'Jrue Holiday' && card.pos === 'SG') {
    return { ...card, secondaryPositions: ['PG'] };
  }
  if (card.name === 'Jimmy Butler' && card.pos === 'SG') {
    return { ...card, secondaryPositions: ['SF', 'PG'] };
  }
  if (card.name === 'Kevin Durant' && card.pos === 'PF') {
    return { ...card, secondaryPositions: ['SF', 'SG'] };
  }
  const defaults = SECONDARY_POSITIONS_BY_NAME[card.name]?.filter((p) => p !== card.pos);
  return defaults && defaults.length > 0
    ? { ...card, secondaryPositions: defaults }
    : card;
}
