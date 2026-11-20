/**
 * Soccer (football) knowledge module.
 *
 * ALL sport-specific content lives here: jargon glossary, quiz, viewing modes,
 * AI prompt context, crowd labels and the scripted demo match. To add another
 * sport later, create js/sports/<sport>.js that registers an object with the
 * same shape via `window.SPORTS.<id> = {...}` and set CONFIG.SPORT to its id.
 *
 * All names and commentary in the demo are invented. No real broadcasters,
 * players or clubs.
 */
window.SPORTS = window.SPORTS || {};

(function () {
  // Helper for cached cards. `m` = which viewing modes see it:
  // k = Kickoff, c = Casual Fan, u = Culture Seeker, t = Tactics Nerd.
  const card = (type, title, explanation, why_it_matters, deeper, term, m = 'kcut') => ({
    type, title, explanation, why_it_matters, deeper, term, modes: m.split('').map(x => ({ k: 'kickoff', c: 'casual', u: 'culture', t: 'tactics' }[x]))
  });

  window.SPORTS.soccer = {
    id: 'soccer',
    name: 'Soccer',

    /** Four viewing modes. `guide` is injected into the AI prompt as {mode}. */
    modes: {
      kickoff: {
        id: 'kickoff', emoji: '🌱', name: 'Kickoff',
        blurb: 'Full beginner. We explain everything, including basic rules, in very simple words.',
        guide: 'Kickoff (full beginner): explain everything including basic rules, in very simple words. Be generous: explain most things worth explaining, up to 2 cards.'
      },
      casual: {
        id: 'casual', emoji: '🎧', name: 'Casual Fan',
        blurb: 'You know the basics. We only explain jargon, unusual ref calls and big moments.',
        guide: 'Casual Fan (knows the basics): do NOT explain basic rules. Only explain jargon, unusual referee calls and big moments.'
      },
      culture: {
        id: 'culture', emoji: '🎭', name: 'Culture Seeker',
        blurb: 'Chants, rivalries, history, traditions and crowd emotion. Less about rules.',
        guide: 'Culture Seeker: prioritise crowd reactions, chants, rivalries, club history and traditions. Keep rules and tactics very brief.'
      },
      tactics: {
        id: 'tactics', emoji: '🧠', name: 'Tactics Nerd',
        blurb: 'Go deeper: formations, pressing and the strategy behind the commentary.',
        guide: 'Tactics Nerd: skip the basics. Explain formations, pressing, shape and strategy behind what the commentator says. "deeper" should always be filled in with tactical detail.'
      }
    },

    /** Extra sport context appended to the system prompt. */
    promptContext: 'The sport is association football (soccer). Card types: language (jargon/slang), move (play or tactic), ref (referee decision and rule), crowd (crowd sound or chant), moment (a "why this matters" card at high-drama moments only).',

    /** Crowd-sound vocabulary (used by the live volume heuristic and the prompt). */
    crowdLabels: ['roar', 'groan', 'whistling or jeering', 'rising anticipation', 'chanting', 'stunned silence', 'singing'],

    /**
     * Glossary used for underlining words in the transcript and for offline
     * fallback explanations. Keys are lowercase; `aliases` are extra spellings.
     */
    jargon: {
      'offside': { meaning: 'An attacker is "offside" if they are nearer the opponent\'s goal than the last defender when a teammate passes to them. It stops players from just waiting by the goal.', why: 'A goal can be cancelled if the scorer was offside.' },
      'clean sheet': { meaning: 'Finishing a match without letting the other team score.', why: 'Defenders and goalkeepers take real pride in keeping one.' },
      'nutmeg': { meaning: 'Kicking the ball through an opponent\'s legs and collecting it on the other side.', why: 'It is a cheeky skill move that can embarrass a defender and delight the crowd.' },
      'parking the bus': { aliases: ['park the bus', 'parked the bus'], meaning: 'Putting almost every player behind the ball to defend, so the other team has no space to score.', why: 'It usually means a team is protecting a lead or fears a stronger opponent.' },
      'set piece': { aliases: ['set pieces', 'set-piece'], meaning: 'A planned restart after play stops, like a corner or free kick.', why: 'Teams practise these routines, so goals often come from them.' },
      'corner': { aliases: ['corner kick'], meaning: 'A free kick taken from the corner of the pitch after a defender last touched the ball before it crossed their own goal line.', why: 'It is a good chance to score because players crowd the goal.' },
      'through ball': { aliases: ['through-ball'], meaning: 'A pass that slips between defenders into open space for a teammate to run onto.', why: 'It can leave an attacker one-on-one with the goalkeeper.' },
      'over the top': { aliases: ['ball over the top'], meaning: 'A long, high pass that flies over the defenders\' heads.', why: 'It is a quick way to get a runner behind the defence.' },
      'the press': { aliases: ['pressing', 'press', 'high press'], meaning: 'Chasing the ball hard, as a team, to win it back quickly.', why: 'It tires players out but can steal the ball close to the goal.' },
      'counter-attack': { aliases: ['counter attack', 'on the counter', 'counter'], meaning: 'Winning the ball and racing forward quickly before the other team can get organised.', why: 'The opponents are often out of position, so chances come fast.' },
      'var': { aliases: ['video assistant referee'], meaning: 'Video Assistant Referee: officials watching replays who can ask the referee to take another look at big decisions.', why: 'It can overturn goals, penalties and red cards.' },
      'yellow card': { meaning: 'A formal warning from the referee. Two yellows in one match means the player is sent off.', why: 'The player must now be careful or risk leaving the match.' },
      'red card': { meaning: 'The referee orders a player off the pitch. Their team plays one player short.', why: 'It usually swings the match.' },
      'penalty': { aliases: ['spot kick'], meaning: 'A free shot at goal from 12 yards, with only the goalkeeper to beat. It is awarded for a foul inside the box.', why: 'Most penalties are scored, so it is a huge moment.' },
      'stoppage time': { aliases: ['added time', 'injury time'], meaning: 'Extra minutes added at the end to make up for time lost to injuries, substitutions and delays.', why: 'Late goals are common, so anything can still happen.' },
      'advantage': { meaning: 'The referee lets play continue after a foul because the fouled team still has a good attack.', why: 'It keeps the game flowing instead of stopping for every foul.' },
      'dive': { aliases: ['simulation', 'diving'], meaning: 'Pretending to be fouled to win a free kick or penalty.', why: 'Referees punish it with a yellow card.' },
      'free kick': { meaning: 'A restart after a foul, where the fouled team gets to kick the ball without being challenged.', why: 'From close range a good kick can score directly.' },
      'handball': { meaning: 'Touching the ball with the hand or arm in a way the rules do not allow.', why: 'Inside the box it can give away a penalty.' },
      'striker': { meaning: 'The attacking player whose main job is to score goals.', why: 'They are usually the ones in the spotlight.' },
      'derby': { meaning: 'A match between two local rivals, usually from the same city or area.', why: 'Pride is on the line, so the atmosphere is extra intense.' },
      'equaliser': { aliases: ['equalizer'], meaning: 'A goal that makes the score level.', why: 'The match is wide open again.' },
      'hat-trick': { aliases: ['hat trick'], meaning: 'When one player scores three goals in a single match.', why: 'It is a rare and celebrated achievement.' },
      'back four': { meaning: 'A line of four defenders across the pitch.', why: 'It is the most common defensive shape.' },
      'formation': { meaning: 'How a team arranges its players, such as 4-4-2 (four defenders, four midfielders, two forwards).', why: 'It shapes how the team attacks and defends.' },
      'cross': { meaning: 'A pass from the wide area of the pitch into the penalty area.', why: 'Attackers try to head or kick it into the goal.' },
      'tackle': { meaning: 'Trying to take the ball from an opponent with your feet.', why: 'A clean tackle wins the ball, a bad one is a foul.' },
      'booked': { meaning: 'Shown a yellow card.', why: 'The player is now on a warning.' },
      'dead ball': { meaning: 'A moment when play is stopped, such as before a free kick or corner.', why: 'Teams often use dead balls to plan a surprise.' }
    },

    /** 8-question onboarding quiz: 4 vocab, 2 rules/ref, 2 culture. */
    quiz: [
      { id: 'v1', cat: 'vocab', kind: 'mc', q: 'In soccer, what does "offside" mean?',
        options: ['A player is standing outside the pitch', 'An attacker is ahead of the last defender when the ball is passed to them', 'A player touched the ball with their hand'],
        correct: 1, explain: 'Offside is about attackers who sneak ahead of the last defender when the pass is played. It keeps players from simply waiting by the goal.' },
      { id: 'v2', cat: 'vocab', kind: 'mc', q: 'A commentator says the team "kept a clean sheet". What happened?',
        options: ['The pitch was very tidy', 'They didn\'t concede a goal', 'They won by a lot of goals'],
        correct: 1, explain: 'A clean sheet means the other team never scored. Defenders and goalkeepers love it.' },
      { id: 'v3', cat: 'vocab', kind: 'heard', q: 'Have you heard the term "nutmeg"?',
        answer: 'It means kicking the ball through an opponent\'s legs. A cheeky move that makes the crowd go "Ooooh!"' },
      { id: 'v4', cat: 'vocab', kind: 'mc', q: 'What is a "set piece"?',
        options: ['A planned restart like a corner or free kick', 'A team\'s starting lineup', 'A trophy for the winners'],
        correct: 0, explain: 'Set pieces are restarts like corners and free kicks. Teams practise them, so goals often come from them.' },
      { id: 'r1', cat: 'rules', kind: 'mc', q: 'What is the difference between a yellow and a red card?',
        options: ['Yellow is a warning, red sends the player off', 'Yellow is for the goalkeeper, red for everyone else', 'Yellow gives a free kick, red gives a penalty'],
        correct: 0, explain: 'Yellow is a warning (two yellows equal a red). Red means the player leaves and the team plays a player short.' },
      { id: 'r2', cat: 'rules', kind: 'heard', q: 'Have you heard of "VAR"?',
        answer: 'VAR is the Video Assistant Referee: officials with replays who can ask the referee to double-check big decisions like goals and red cards.' },
      { id: 'c1', cat: 'culture', kind: 'mc', q: 'Why do soccer fans sing and chant so much?',
        options: ['It is a way to support the team, show belonging and lift the players', 'The stadium makes them do it', 'It is a rule of the game'],
        correct: 0, explain: 'Chants and songs are a shared tradition. They build belonging, back the team and often carry a club\'s history.' },
      { id: 'c2', cat: 'culture', kind: 'mc', q: 'What is a "derby"?',
        options: ['A type of hat fans wear', 'A match between local rivals', 'The final of a tournament'],
        correct: 1, explain: 'A derby is a match between local rivals. Bragging rights are at stake, so the atmosphere is extra loud.' }
    ],

    /**
     * Scripted ~3 minute demo match. Invented generic text only.
     * Each event: t (seconds from start), text (commentary), crowd (label),
     * cached (offline fallback cards used if Gemini is unavailable).
     */
    demo: {
      title: 'Red FC vs Blue United',
      durationSec: 185,
      events: [
        { t: 2, text: 'Welcome along. Red FC against Blue United, and both sides look a little nervous early on.', crowd: 'murmur of anticipation', cached: [] },
        { t: 10, text: 'Blue United are pressing high here, hunting the ball the second Red FC get it.',
          cached: [card('move', 'The press', 'Blue United are chasing the ball as a group the moment Red FC have it.', 'If they win it high up the pitch, they are close to goal and Red FC can\'t get organised.', 'Pressing works best when the whole team moves together. It costs a lot of energy, so teams usually can\'t keep it up all game.', 'press')] },
        { t: 22, text: 'And Red FC have dropped everyone behind the ball. They are parking the bus.',
          cached: [card('language', 'Parking the bus', 'It means a team is defending with almost everyone behind the ball, like a big bus blocking the goal.', 'Red FC are nervous and want to be hard to score against, even if it means attacking less.', 'It is a negative-sounding phrase, but it can be smart tactics for a team facing a stronger opponent.', 'parking the bus', 'kcut')] },
        { t: 36, text: 'Red FC are taking their time over this throw-in and the home fans are not happy.', crowd: 'whistling and jeering',
          cached: [card('crowd', 'Whistling and jeering', 'Fans whistling loudly is the soccer way of booing. It means they think Red FC are wasting time.', 'Whistles often get louder when a team slows the game down to protect a lead.', 'In some countries whistling is a sign of disapproval, much like booing elsewhere.', null, 'kcut')] },
        { t: 52, text: 'A ball over the top and the striker is in behind! But the flag goes up. He has been caught offside.',
          cached: [card('ref', 'Offside', 'The attacker was ahead of the last defender when the ball was passed, so the referee\'s assistant raised the flag.', 'The attack is cancelled, so Blue United will have to start again.', 'The key moment is when the pass is kicked, not when the attacker receives it.', 'offside', 'kcut'), card('language', 'A ball over the top', 'A long, high pass over the defenders\' heads.', 'It tries to get a runner behind the defence in a single move.', null, 'over the top', 'kc')] },
        { t: 68, text: 'GOAL! Blue United score! Oh, but wait. The referee is touching his ear. There will be a VAR check for offside.', crowd: 'roar, then a nervous hush',
          cached: [card('crowd', 'Roar, then a nervous hush', 'The crowd roared for a goal, then went quiet when they realised the goal might not count.', 'Fans are suspended between celebrating and worrying while the replay is checked.', null, null, 'kcut'), card('ref', 'VAR check', 'Officials are watching replays to see if the goal was legal. They are checking for offside.', 'The goal only counts if they confirm it.', 'VAR can only step in for clear and obvious errors on goals, penalties, red cards and mistaken identity.', 'var', 'kcut')] },
        { t: 82, text: 'And it is no goal. The striker was offside by a toenail. The goal is disallowed.', crowd: 'groan from the Blue United fans',
          cached: [card('ref', 'Goal disallowed for offside', 'The replay showed the scorer was a tiny bit ahead of the last defender, so the goal does not count.', 'It will feel harsh to Blue United\'s fans, as it was such a close call.', 'Offside decisions are measured to the millimetre now, which is why fans often argue about them.', 'offside', 'kcut'), card('moment', 'Why this matters', 'Blue United thought they were winning, and now it is still 0-0.', 'Every chance now feels bigger because goals are hard to come by.', null, null, 'kcut')] },
        { t: 100, text: 'He has nutmegged the defender! Through the legs and away!', crowd: 'ooh from the crowd',
          cached: [card('language', 'Nutmeg', 'Kicking the ball through a defender\'s legs and running around to collect it.', 'It is a skill move that makes the defender look silly, which is why the crowd said "ooh!"', 'The name is thought to come from old English slang. The exact origin is unclear.', 'nutmeg', 'kcu')] },
        { t: 116, text: 'He goes down very easily and the referee is not fooled. That is a yellow card for diving.', crowd: 'loud boos',
          cached: [card('ref', 'Yellow card for diving', 'The player pretended to be fouled. The referee spotted it and gave a yellow card as a warning.', 'Another yellow card means he is sent off, so he has to be careful now.', 'Diving, or simulation, is cheating, and referees can book players for it.', 'dive', 'kcut')] },
        { t: 132, text: 'Corner kick to Red FC. A dangerous set piece here.', crowd: 'rising anticipation',
          cached: [card('language', 'Set piece', 'A planned restart. Here it is a corner, where Red FC get a free kick from the corner of the pitch.', 'Teams practise these routines, so this is one of their best chances to score.', 'Many goals in a match come from set pieces.', 'set piece', 'kct')] },
        { t: 146, text: 'GOAL! Red FC take the lead from the corner! What a header!', crowd: 'huge roar, then the home end sings its traditional song',
          cached: [card('moment', 'Why this matters', 'Red FC scored from the set piece they had been building toward, and they lead 1-0.', 'There is not much time left, and the pressure on Blue United just doubled.', null, null, 'kcut'), card('crowd', 'Roar and the club song', 'After the goal, the home fans burst into their club\'s traditional song. Fans of many clubs sing together as a way to share joy and show belonging.', 'Songs like this often go back generations. Words and tunes vary from club to club.', 'Some chants in stadiums are controversial or crude, so many clubs encourage songs that celebrate the team instead.', null, 'kcut')] },
        { t: 164, text: 'The fourth official shows four minutes of stoppage time. Blue United are throwing everyone forward.', crowd: 'tension building',
          cached: [card('language', 'Stoppage time', 'Extra minutes added at the end to make up for time lost during the match.', 'Blue United have only four minutes to find an equaliser, so every ball matters.', null, 'stoppage time', 'kcut'), card('moment', 'Why this matters', 'One goal here would change everything. It is the most tense stretch of the match.', 'Anything can happen in these final minutes.', null, null, 'kcut')] },
        { t: 176, text: 'Red FC just need to hold on and keep a clean sheet.', crowd: 'nervous whistling for the final whistle',
          cached: [card('language', 'Clean sheet', 'Finishing the match without letting the other team score.', 'Red FC\'s defenders are desperate for it, and every Blue United attack is a threat.', null, 'clean sheet', 'kcut')] },
        { t: 184, text: 'And that is full time! A win for Red FC.', crowd: 'cheering and singing', cached: [] }
      ]
    }
  };
})();
