const { env } = require('process');

// eslint-disable-next-line padding-line-between-statements
const COMMON_TEST_TASKS = [
    'build',
    'karma:expectation-chrome',
    'karma:expectation-edge',
    'karma:expectation-firefox',
    'karma:expectation-opera',
    'karma:expectation-safari-legacy',
    'karma:integration',
    'karma:unit',
    'sh:test-memory'
];

module.exports = {
    build: [
        'clean:build',
        'modernizr',
        'replace:modernizr',
        'clean:modernizr',
        'sh:build-es2018',
        'sh:build-es5'
    ],
    continuous: [
        'test',
        'watch:continuous'
    ],
    lint: [
        'eslint',
        // @todo Use grunt-lint again when it support the type-check option.
        'sh:lint'
    ],
    test: (env.TRAVIS)
        ? COMMON_TEST_TASKS
        : [ ...COMMON_TEST_TASKS, 'karma:expectation-chrome-canary', 'karma:expectation-firefox-developer', 'karma:expectation-safari' ]
};
