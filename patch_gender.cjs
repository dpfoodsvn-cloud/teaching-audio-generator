const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

if (content.includes('Detected name-only format')) {
    console.log('Already patched!');
    process.exit(0);
}

const oldCode = `    const parts = m[1].split(';');
    for (const part of parts) {`;

const newCode = `    const contentInParens = m[1];
    const hasSemicolon = contentInParens.includes(';');
    const hasGenderKeyword = /\\b(male|female|man|woman|boy|girl)\\b/i.test(contentInParens);
    
    if (!hasSemicolon && !hasGenderKeyword) {
        console.log('[Gender Parser] Detected name-only format, using name-based detection');
        const names = contentInParens.split(',').map(n => n.trim()).filter(n => n);
        const femaleNames = /\\b(lucy|linda|laura|lauren|lily|grace|natalie|rachel|rebecca|hannah|susan|karen|nancy|betty|helen|sandra|donna|carol|ruth|sharon|michelle|melissa|deborah|stephanie|amy|angela|marie|martha|julia|alice|diana|nadia|elena|rose|clara|iris|hazel|fiona|ivy|audrey|stella|nina|gina|tina|eva|ada|ella|maya|lena|zoe|cora|nora|dora|vera|sara|tara|kara|mira|sophie|sarah|mary|jane|lisa|emma|olivia|ava|isabella|mia|charlotte|amelia|harper|evelyn|anna|chloe|mai|lan|hong|linh|kim|jessica|jennifer|emily|nicole|thao|hoa|nga|huong|mrs|ms|miss|lady|woman|girl|mother|mom|aunt|grandma|sister|daughter|queen|princess)\\b/i;
        const maleNames = /\\b(sam|bob|bill|jim|ted|max|luke|adam|carl|eric|evan|gary|greg|ivan|ian|joel|josh|karl|kent|kurt|lars|leon|luis|marc|matt|neil|noel|omar|otto|phil|rene|rick|ross|rory|roy|sean|seth|todd|troy|wade|alan|dean|doug|leo|liam|mark|john|james|robert|michael|william|david|richard|joseph|thomas|charles|ben|tom|peter|paul|george|henry|frank|jack|alex|chris|mike|joe|dan|steve|nick|tim|tony|andrew|kevin|brian|ethan|noah|oliver|jacob|lucas|mason|logan|ryan|nathan|kyle|mr|sir|man|boy|father|dad|uncle|grandpa|brother|son|king|prince|narrator|interviewer|teacher|student|host|speaker)\\b/i;
        
        for (const name of names) {
            if (femaleNames.test(name)) {
                genders[name] = 'female';
                console.log('[Gender Parser] ' + name + ' -> female (from name)');
            } else if (maleNames.test(name)) {
                genders[name] = 'male';
                console.log('[Gender Parser] ' + name + ' -> male (from name)');
            } else {
                genders[name] = 'unknown';
                console.log('[Gender Parser] ' + name + ' -> unknown');
            }
        }
        return { genders };
    }
    
    const parts = contentInParens.split(';');
    for (const part of parts) {`;

if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    fs.writeFileSync('src/App.tsx', content);
    console.log('SUCCESS: Patched!');
} else {
    console.log('Pattern not found');
}
