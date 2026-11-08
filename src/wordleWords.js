// Lunethle word lists.
// ANSWERS: common 5-letter English words that may be selected as a daily answer.
// EXTRA:   additional valid 5-letter guesses that are accepted but never chosen.
// Everything is validated at load time (see tests/wordle.check.js).

const ANSWERS = `
about above abuse actor acute admit adopt adult after again agent agree ahead alarm
album alert alike alive allow alone along alter among anger angle angry apart apple
apply arena argue arise armor array arrow aside asset audio audit avoid awake award
aware awful bacon badge basic basin batch beach beard beast began begin being below
bench berry birth black blade blame blank blast blend bless blind block blood bloom
board boast bonus boost booth bound brain brake brand brass brave bread break breed
brick bride brief bring brisk broad broke brown brush build built burst buyer cabin
cable camel canal candy canon cargo carry carve catch cause cease chain chair chalk
charm chart chase cheap cheat check cheek cheer chess chest chief child chill china
chose civil claim clash class clean clear clerk click cliff climb clock close cloth
cloud clown coach coast cobra cocoa colon color couch cough could count court cover
crack craft crane crash crate crazy cream creek crest crime crisp cross crowd crown
crude cruel crush crust curve cycle daily dairy dance dated dealt death debut decay
delay delta dense depth derby devil diary dirty ditch dizzy dodge doing donor doubt
dozen draft drain drama drank drawn dream dress dried drift drill drink drive drone
drove drown eager eagle early earth eight elbow elder elect elite email empty enjoy
enter entry equal error essay event every exact excel exist extra fable faced faint
fairy faith false fancy fatal fault favor feast fence ferry fetch fever fiber field
fiery fifth fifty fight final first flame flash fleet flesh flick flint float flock
flood floor flour fluid flush focus force forge forth forty forum found frame fraud
fresh fried frost fruit fully funny gauge ghost giant given glass globe glove glory
goose grace grade grain grand grant graph grasp grass grave great greed green greet
grief grill grind groan groom group grove grown guard guess guest guide guilt habit
hairy handy happy harsh haste hatch haunt haven havoc heart heavy hedge hello hence
hobby honey honor horse hotel house hover human humid humor hurry ideal image imply
index inner input intro irony issue ivory jiffy jolly judge juice jumbo karma kayak
kneel knife knock known label labor laden lance large laser latch later laugh layer
learn lease least leave legal lemon level lever light limit linen liner liver lobby
local lodge logic loose lorry lofty loyal lucky lunar lunch lying magic magma major
maker mango maple march marsh match maybe mayor medal media melon mercy merge merit
merry metal meter midst might mimic miner minor minus model modem moist money month
moral motel motif motor mound mount mourn mouse mouth movie muddy mummy mural music
musty naked nasty naval needy nerve never newly night noble noise north notch noted
novel nurse oasis occur ocean offer often olive onion opera orbit order organ other
otter ought ounce outer owner oxide paint panel panic paper party pasta patch patio
pause peace peach pearl pedal penny perch peril petal phase phone photo piano piece
pilot pinch pitch pivot pixel pizza place plain plane plant plate plaza plead pluck
plumb plump point polar porch power press price pride prime print prior prism prize
probe prone proof proud prove prune pulse punch pupil puppy purse queen query quest
queue quick quiet quill quilt quirk quite quota quote radar radio raise rally ranch
range rapid ratio raven reach react ready realm rebel refer reign relax relay renew
repay reply rider ridge rifle right rigid rinse risen risky rival river roast robin
robot rocky rogue roman rough round route royal rugby ruler rumor rural sadly saint
salad salon salsa sandy sauce saved scale scalp scene scent scoop scope score scout
scrub sedan seize sense serve seven shade shady shaft shake shall shame shape share
shark sharp shave sheep sheet shelf shell shift shine shiny shirt shock shoot shore
short shout shown shrub sight silly since siren sixth sixty skate skill skirt slack
slain slant slate sleep sleet slice slide slime slope small smart smash smile smoke
snack snake sneak snowy soapy sober solar solid solve sorry sound south space spare
spark speak spear speed spell spend spent spice spicy spike spill spine spite split
spoil spoke spoon sport spray squad squat stack staff stage stain stair stake stale
stall stamp stand stare start state steak steal steam steel steep steer stern stick
stiff still sting stock stole stone stood stool store storm story stove strap straw
stray strip stuck study stuff stump style sugar suite sunny super sushi swamp swarm
swear sweat sweep sweet swell swept swift swing swore sword syrup table taken tally
tango taste teach tease teddy tempo tenor tense tenth thank theft their theme there
these thick thief thigh thing think third thorn those three threw throw thumb tidal
tiger tight timer timid tired title toast today token tooth topic torch total touch
tough towel tower toxic trace track trade trail train trait tramp trash treat trend
trial tribe trick tried troop trout truck truly trunk trust truth tulip tumor tuner
turbo tutor twice twist ultra uncle under union unite unity until upper upset urban
usage usher usual utter vague valid value valve vapor vault venue verse video vigor
villa vinyl viral virus visit vital vivid vocal voice voter wagon waist waste watch
water weary weave wedge weigh weird whale wheat wheel where which while white whole
whose widen widow width windy witch woman world worry worse worst worth would wound
woven wrist write wrong yacht yield young yours youth zebra zesty
`;

// Accepted-but-never-chosen guesses (inflections, less common words).
const EXTRA = `
abbey abide abode acorn adapt adept adore agile agent agile aisle alarm algae alley
alloy aloft aloha alpha amass amaze amber amble amend ample amuse angel ankle annex
annoy anvil apart aphid apnea aptly arbor ardor areas arena argon arias armed aroma
arras ascot ashen ashes atlas atoll atoms attic augur aunts aurae avail avert avian
awoke axiom azure babes bacon badly bagel baked baker balmy banal bands banjo banks
barge baron basks bated bathe baton bawdy bayou beads beams beans bears beats beefy
beefs beeps befit begat beget begun beige belch belie belle bells belly belts bemix
bench bends bento beret berth beset betas bevel bezel bible bicep biddy bigot bilge
bills binge bingo biome birch birds birth bison bites bitty blaze blebs bleed bleep
blend blimp blink blips blitz bloat blobs blogs blond bloop blots blows bluff blunt
blurb blurs blurt blush boars boast boats bobby bodhi bogus boils bolts bombs bongo
bonny bonus booby boots booze borax bored borne bossy botch bough boule bowed bowel
bower bowls boxed boxes boxer braid brail brain braze
`;

const answerList = ANSWERS.trim().split(/\s+/).filter(Boolean);
const extraList = EXTRA.trim().split(/\s+/).filter(Boolean);

for (const w of [...answerList, ...extraList]) {
  if (!/^[a-z]{5}$/.test(w)) throw new Error(`Lunethle word list: invalid word "${w}"`);
}

const ANSWER_SET = new Set(answerList);
const VALID = new Set([...answerList, ...extraList]);

module.exports = {
  ANSWERS: answerList,
  isValidWord: (w) => VALID.has(String(w || '').toLowerCase()),
  isAnswerWord: (w) => ANSWER_SET.has(String(w || '').toLowerCase()),
};
