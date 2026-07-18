const fs = require('fs');
let code = fs.readFileSync('modules/game-modes-v2.js', 'utf8');

code = code.replace(
    /window\.addQuizQuestionUI = \(\) => \{\s*quizBuilderQuestions\.push\(createEmptyQuizQuestion\(\)\);\s*updateBuilderUI\(\);\s*\};/,
    `window.addQuizQuestionUI = () => {
        quizBuilderQuestions.push(createEmptyQuizQuestion());
        window.activeQuizBuilderIndex = quizBuilderQuestions.length - 1;
        updateBuilderUI();
    };`
);

fs.writeFileSync('modules/game-modes-v2.js', code);
