"use strict";
var fs = require('fs');
const markdown = require('logdown/src/markdown/node');
var find = require('find');
var request = require('request');
var globalRunId = null;
var globalRuns = new Map();
var globalPlanId = null;
var globalCaseId = null;
var globalResultsSteps = new Map();
Object.defineProperty(exports, "__esModule", {value: true});
var plans = null;
var axios = require('axios');
var chalk = require('chalk');
var TestRail = /** @class */ (function () {
    function TestRail(options) {
        this.options = options;
        this.base = "https://" + options.domain + "/index.php?/api/v2";
    }

    TestRail.prototype.deletePlans = function (name, description) {
        var _this = this;
        axios({
            method: 'get',
            url: this.base + "/get_plans/" + this.options.projectId,
            headers: {'Content-Type': 'application/json'},
            auth: {
                username: this.options.username,
                password: this.options.password,
            }
        }).then(response => {
            response.data.forEach(entry => {
                console.log(entry.id)
                axios({
                    method: 'post',
                    url: this.base + "/delete_plan/" + entry.id,
                    headers: {'Content-Type': 'application/json'},
                    auth: {
                        username: this.options.username,
                        password: this.options.password,
                    }
                })
            })
        }).catch(function (error) {
            return console.error(error);
        });

    };

    TestRail.prototype.clearLogs = function (name, description) {
        var _this = this;
        try {
            let filePath = './cypress/logs/'
            const find = require('find');
            find.file(filePath, (files) => {
                files.forEach(file => {
                    console.log('file name ' + file)
                    fs.unlink(file, err => {
                        if (err) throw err;
                    });
                });
            });
        } catch (err) {
            console.log('Log folder does not exist', err)
        }

    };

    TestRail.prototype.createPlan = function (name, description) {
        var _this = this;
        if (globalPlanId === null) {
            this.getAllSuites().then(data => {
                const suitesData = data.map(function (data) {
                    return {
                        name: data.name,
                        suite_id: data.id
                    };
                });
                axios({
                    method: 'post',
                    url: this.base + "/add_plan/" + this.options.projectId,
                    headers: {'Content-Type': 'application/json'},
                    auth: {
                        username: this.options.username,
                        password: this.options.password,
                    },
                    data: JSON.stringify({
                        name: name,
                        entries: suitesData
                    }),
                }).then(function (response) {
                    response.data.entries.forEach(function (entry) {
                        entry.runs.forEach(function (run) {
                            globalRuns.set(run.suite_id, run.id)
                        })
                    })
                    _this.planId = response.data.id;
                    globalPlanId = response.data.id
                }).catch(function (error) {
                    return console.error(error);
                });
            })
        }
    };

    TestRail.prototype.getAllSuites = function () {
        return axios({
            method: 'get',
            url: this.base + "/get_suites/" + this.options.projectId,
            headers: {'Content-Type': 'application/json'},
            auth: {
                username: this.options.username,
                password: this.options.password,
            }
        }).then(function (response) {
            return response.data
        }).catch(function (error) {
            return console.error(error);
        });
    };

    TestRail.prototype.deleteRun = function () {
        axios({
            method: 'post',
            url: this.base + "/delete_run/" + globalRunId,
            headers: {'Content-Type': 'application/json'},
            auth: {
                username: this.options.username,
                password: this.options.password,
            },
        }).catch(function (error) {
            return console.error(error);
        });
    };

    TestRail.prototype.getCaseData = function (caseId) {
        return axios({
            method: 'get',
            url: this.base + "/get_case/" + caseId,
            headers: {'Content-Type': 'application/json'},
            auth: {
                username: this.options.username,
                password: this.options.password,
            }
        }).then(function (response) {
            return response.data
        }).catch(function (error) {
            return console.error(error);
        });
    };

    TestRail.prototype.publishResults = function (results) {
        var _this = this;
        results.forEach(result => {
            this.getCaseData(result['case_id']).then(caseData => {
                this.loadTestResultsIntoSuite(result, globalRuns.get(caseData.suite_id))
            })
        })
    };

    TestRail.prototype.loadStatusAndComments = function (result, runId) {
        var _this = this;
        return axios({
            method: 'post',
            url: this.base + "/add_results_for_cases/" + runId,
            headers: {'Content-Type': 'application/json'},
            auth: {
                username: this.options.username,
                password: this.options.password,
            },
            data: JSON.stringify({results: [result]}),
        }).then(function (response) {
            console.log('\n', chalk.magenta.underline.bold('(TestRail Reporter)'));
            console.log('\n', `Test ${result['case_id']}` + " - Results are published to " + chalk.magenta("https://" + _this.options.domain + "/index.php?/runs/view/" + runId), '\n');
            return response.data
        }).catch(function (error) {
            return console.error(error);
        });
    };

    TestRail.prototype.loadAttachment = function (resultId, attachment) {
        var _this = this;
        const options = {
            method: "POST",
            url: this.base + "/add_attachment_to_result/" + resultId,
            headers: {
                "Content-Type": "multipart/form-data"
            },
            auth: {
                username: this.options.username,
                password: this.options.password,
            },
            formData: {
                "attachment": fs.createReadStream(`./${attachment}`)
            }
        };

        request(options, function (err, res, body) {
            if (err) console.log(err);
        })
    };

    TestRail.prototype.addAttachmentToResult = function (result, loadedResultId, runId) {
        var _this = this;
        var caseId = result.case_id
        try {
            find.file('./cypress/screenshots/', (files) => {
                files.filter(file => file.includes(`C${caseId}`)).forEach(screenshot => {
                    this.loadAttachment(loadedResultId, screenshot)
                })
            });
        } catch (err) {
            console.log('Error on adding screenshots', err)
        }
    };

    TestRail.prototype.addLogsToFailedTests = function (result, runId) {
        var _this = this;
        try {
            find.file('./cypress/logs/', (files) => {
                files.filter(file => file.includes(`${result.case_id}`)).forEach(logfile => {
                    var contents = fs.readFileSync(logfile);
                    var jsonContent = JSON.parse(contents);
                    const formatMarkdown = s => markdown.parse(s).text
                    jsonContent.testCommands = jsonContent.testCommands
                        .map(formatMarkdown).join('\n')

                    var statusAndCommentsData = {
                        case_id: result.case_id,
                        status_id: result.status_id,
                        comment: "FULL LOG\n================================\n" + jsonContent.testCommands
                    };
                    this.loadStatusAndComments(statusAndCommentsData, runId)
                })
            });
        } catch (err) {
            console.log('Error on adding log file', err)
        }
    };


    TestRail.prototype.loadLogsFile = function (results) {
        results.forEach(result => {
            find.file('./cypress/logs2/', (files) => {
                files.filter(file => file.includes(`${result['case_id']}`)).forEach(file => {
                    fs.readFile(file, 'utf8', (err, jsonString) => {
                        if (err) {
                            console.log("Error reading file from disk:", err)
                        }
                        try {
                            const info = JSON.parse(jsonString)
                            globalResultsSteps.set(result['case_id'], info.testCommands)
                        } catch (err) {
                            console.log('Error parsing JSON string:', err)
                        }
                    })
                })
            });
        });
    };

    TestRail.prototype.loadTestResultsIntoSuite = function (result, runId) {
        var statusAndCommentsData = {
            case_id: result.case_id,
            status_id: result.status_id,
            comment: result.comment
        };

        this.loadStatusAndComments(statusAndCommentsData, runId).then(loadedResults => {
            console.log(loadedResults)
            try {
                loadedResults.forEach(loadedResult => {
                    this.addAttachmentToResult(result, loadedResult['id'], runId)
                    this.addLogsToFailedTests(result, runId)
                })
            } catch (err) {
                console.log('Error on adding attachments/logs for loaded results', err)
            }
        })
    };
    return TestRail;
}());
exports.TestRail = TestRail;
//# sourceMappingURL=testrail.js.map