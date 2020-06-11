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
        const pathToFile = "./node_modules/cypress-testrail-logs-screenshots/dist/" + process.env.build_id + ".json";

        if (globalPlanId === null) {
            this.getAllSuites().then(data => {
                const suitesData = data.map(function (data) {
                    return {
                        name: data.name,
                        suite_id: data.id
                    };
                });

                fs.access(pathToFile, fs.F_OK, (err) => {
                    if (err) {
                        var planData = {};
                        planData.planId = null;
                        console.log('Create plan id file');
                        fs.writeFile(pathToFile,
                            JSON.stringify(planData), function (err) {
                                if (err) throw err;
                                console.log('complete');
                            }
                        );
                        console.log('Create plan in Test Rail via API call');
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
                            globalPlanId = response.data.id;
                            planData.planId = response.data.id;

                            fs.writeFile(pathToFile,
                                JSON.stringify(planData), function (err) {
                                    if (err) throw err;
                                    console.log('Wrote plan id into file ' + planData.planId);
                                }
                            );
                        }).catch(function (error) {
                            return console.error(error);
                        });
                    } else {
                        console.log('Test Rail Report already exists');
                        var reportingPlan = {};
                        while (reportingPlan.planId = JSON.parse(fs.readFileSync(pathToFile, 'utf8')).planId === null) {
                            console.log('plan id still not received')
                        }

                        reportingPlan.planId = JSON.parse(fs.readFileSync(pathToFile, 'utf8')).planId;
                        console.log('planId: ' + reportingPlan.planId);
                        axios({
                            method: 'get',
                            url: this.base + "/get_plan/" + reportingPlan.planId,
                            headers: {'Content-Type': 'application/json'},
                            auth: {
                                username: this.options.username,
                                password: this.options.password,
                            }
                        }).then(function (response) {
                            response.data.entries.forEach(function (entry) {
                                entry.runs.forEach(function (run) {
                                    globalRuns.set(run.suite_id, run.id)
                                })
                            })
                            _this.planId = response.data.id;
                            globalPlanId = response.data.id;
                        }).catch(function (error) {
                            return console.error(error);
                        });
                    }
                })
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
        var promises = [];
        var runIdSet = new Set();

        results.forEach(result => {
            promises.push(
                this.getCaseData(result['case_id']).then(caseData => {
                    result.runId = globalRuns.get(caseData.suite_id);
                    runIdSet.add(result.runId);
                    return result;
                }))
        })

        Promise.all(promises).then((value) => {
                runIdSet.forEach(id => {
                    console.log("runId: " + id);
                    const resultsForLoading = results.filter(result => result.runId === id);
                    this.loadTestResultsIntoSuite(resultsForLoading, id)
                })
            }
        );
    };

    TestRail.prototype.loadStatusAndComments = function (results, runId) {
        var _this = this;
        return axios({
            method: 'post',
            url: this.base + "/add_results_for_cases/" + runId,
            headers: {'Content-Type': 'application/json'},
            auth: {
                username: this.options.username,
                password: this.options.password,
            },
            data: JSON.stringify({results: results}),
        }).then(function (response) {
            console.log('\n', chalk.magenta.underline.bold('(TestRail Reporter)'));
            results.forEach(result => {
                console.log('\n', `Test ${result['case_id']}` + " - Results are published to "
                    + chalk.magenta("https://" + _this.options.domain + "/index.php?/runs/view/" + runId), '\n');
            })
            return response.data
        }).catch(function (error) {
            return console.error(error);
        });
    };

    TestRail.prototype.loadAttachment = function (resultId, attachment) {
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

    TestRail.prototype.addAttachmentToResult = function (result, loadedResultId) {
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

    TestRail.prototype.addLogsToFailedTests = function (results, runId) {
        results.forEach(result => {
            find.file('./cypress/logs/', (files) => {
                files.filter(file => file.includes(`${result.case_id}`)).forEach(logfile => {
                    var contents = fs.readFileSync(logfile);
                    var jsonContent = JSON.parse(contents);
                    const formatMarkdown = s => markdown.parse(s).text
                    jsonContent.testCommands = jsonContent.testCommands
                        .map(formatMarkdown).join('\n')

                    try {
                        this.loadStatusAndComments([{
                            case_id: result.case_id,
                            status_id: result.status_id,
                            comment: "FULL LOG\n================================\n" + jsonContent.testCommands
                        }], runId);
                    } catch (err) {
                        console.log('Error on adding log file', err);
                    }
                })
            });
        })
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

    TestRail.prototype.loadTestResultsIntoSuite = function (results, runId) {
        var promises = [];

        results.forEach(result => {
            promises.push(
                {
                    case_id: result.case_id,
                    status_id: result.status_id,
                    comment: result.comment
                })
        })

        Promise.all(promises).then(() => {
            console.log(promises.length)
            this.loadStatusAndComments(promises, runId).then(loadedResults => {
                try {
                    loadedResults.forEach((loadedResult, index) => {
                        this.addAttachmentToResult(results[index], loadedResult['id']);
                    })
                } catch (err) {
                    console.log('Error on adding attachments/logs for loaded results', err)
                }

                this.addLogsToFailedTests(results, runId);
            })
        })

    };
    return TestRail;
}());
exports.TestRail = TestRail;
