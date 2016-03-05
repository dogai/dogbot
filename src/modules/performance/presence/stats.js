/*
 * Copyright (C) 2016, Hugo Freire <hugo@dog.ai>. All rights reserved.
 */

var logger = require('../../../utils/logger.js'),
    _ = require('lodash'),
    moment = require('moment'),
    later = require('later'),
    Promise = require("bluebird");

later.date.localTime();

function presence() {
}

presence.prototype.start = function () {
    this.communication.on('performance:presence:stats:update:yesterday', this._updateAllEmployeeStatsWithYesterday.bind(this));

    this.communication.emit('worker:job:enqueue', 'performance:presence:stats:update:yesterday', null, '1 hour');
};

presence.prototype.stop = function () {
    this.communication.removeListener('performance:presence:stats:generate:yesterday', this._updateAllEmployeeStatsWithYesterday.bind(this));

    this.communication.emit('worker:job:dequeue', 'performance:presence:stats:generate:yesterday');
};

presence.prototype._updateAllEmployeeStatsWithYesterday = function (params, callback) {
    var date = moment().subtract(1, 'day');

    this._updateAllEmployeeStatsForDate(date)
        .then(function () {
            callback();
        })
        .catch(function (error) {
            logger.error(error.stack);
            callback(error);
        });
};

presence.prototype._updateAllEmployeeStatsForDate = function (date) {
    var self = this;

    return self._findAllEmployees()
        .mapSeries(function (employee) {
            return self._updateEmployeeDailyStats(employee, date)
                .then(function () {
                    return Promise.mapSeries(['monthly', 'yearly', 'alltime'], function (period) {
                        return self._updateEmployeePeriodStats(employee, date, period);
                    });
                })
                .catch(function (error) {
                    logger.error(error.stack);
                });
        });
};


presence.prototype._updateEmployeeDailyStats = function (employee, date) {
    var self = this;

    var startDate = date.clone().startOf('day').toDate();
    var endDate = date.clone().endOf('day').toDate();

    return Promise.join(
        this._findAllPresencesByEmployeeIdAndBetweenDates(employee.id, startDate, endDate),
        this._findAllStatsByEmployeeIdAndPeriod(employee.id, 'daily'), function (performance, oldStats) {
            var _oldStats = oldStats && oldStats.length > 0 && oldStats[oldStats.length - 1] || undefined;

            return self._computeEmployeeDailyStats(employee, date, performance)
                .then(function (newStats) {
                    var metadata = ['is_synced', 'created_date', 'updated_date', 'name', 'period', 'employee_id'];

                    if (!_.isEqual(_.omit(_oldStats, metadata), _.omit(newStats, metadata))) {
                        var _newStats = _.extend(newStats, {is_synced: false});

                        return self._createOrUpdateStatsByEmployeeIdAndPeriod(employee.id, _newStats.period, _newStats);
                    }
                })
        });
};

presence.prototype._computeEmployeeDailyStats = function (employee, date, performance) {
    var self = this;

    return Promise.props({
        total_duration: self._computeEmployeeDailyTotalDuration(date, performance),
        start_time: self._computeEmployeeDailyStartTime(date, performance),
        end_time: self._computeEmployeeDailyEndTime(date, performance)
    }).then(function (stats) {
        var now = moment();
        var _stats = _.extend(stats, {
            created_date: now.format(),
            updated_date: now.format(),
            period: 'daily',
            started_date: date.clone().startOf('day').format(),
            ended_date: date.clone().endOf('day').format()
        });
        return _stats;
    });
};

presence.prototype._computeEmployeeDailyTotalDuration = function (date, presences) {
    var totalDuration = moment.duration();

    if (presences) {
        for (var i = 0; i < presences.length; i++) {
            if (presences[i])

                var diff;
            if (presences[i].is_present) {
                var next;
                if (i + 1 < presences.length) {
                    next = moment(presences[i + 1].created_date);
                    diff = next.diff(moment(presences[i].created_date));
                } else {
                    next = moment(presences[i].created_date).clone().endOf('day');
                    diff = next.diff(moment(presences[i].created_date));
                }
                totalDuration = totalDuration.add(diff);

            } else if (i == 0) {
                var previous = moment(presences[i].created_date).clone().startOf('day');
                diff = moment(presences[i].created_date).diff(previous);
                totalDuration = totalDuration.add(diff);
            }
        }
    }

    return totalDuration.asSeconds();
};

presence.prototype._computeEmployeeDailyStartTime = function (date, performance) {
    if (performance && performance[0] && performance[0].is_present) {
        return moment(performance[0].created_date).diff(date.clone().startOf('day'), 'seconds');
    } else {
        return 0;
    }
};

presence.prototype._computeEmployeeDailyEndTime = function (date, performance) {
    if (performance && performance.length > 0) {
        var endDate;
        if (performance[performance.length - 1].is_present) {
            endDate = moment(performance[performance.length - 1].created_date).clone().endOf('day');
            return endDate.diff(date.clone().startOf('day'), 'seconds');
        } else {
            endDate = moment(performance[performance.length - 1].created_date);
            return endDate.diff(date.clone().startOf('day'), 'seconds');
        }
    } else {
        return 0;
    }
};


presence.prototype._updateEmployeePeriodStats = function (employee, date, period) {
    var self = this;

    Promise.join(this._findAllStatsByEmployeeIdAndPeriod(employee.id, 'daily'), this._findAllStatsByEmployeeIdAndPeriod(employee.id, period),
        function (dailyStats, oldStats) {
            var _dailyStats = dailyStats && dailyStats.length > 0 && dailyStats[dailyStats.length - 1] || undefined;
            var _oldStats = oldStats && oldStats.length > 0 && oldStats[dailyStats.length - 1] || undefined;

            return self._computeEmployeePeriodStats(employee, _dailyStats, _oldStats, date, period)
                .then(function (newStats) {
                    var metadata = ['is_synced', 'created_date', 'updated_date', 'name', 'period', 'employee_id'];

                    if (!_.isEqual(_.omit(_oldStats, metadata), _.omit(newStats, metadata))) {
                        var _newStats = _.extend(newStats, {is_synced: false});

                        return self._createOrUpdateStatsByEmployeeIdAndPeriod(employee.id, period, _newStats);
                    }
                })
                .catch(function (error) {
                    logger.error(error.stack);
                });
        });
};

presence.prototype._computeEmployeePeriodStats = Promise.method(function (employee, dailyStats, stats, date, period) {

    if (dailyStats && stats && moment(dailyStats.started_date).isBefore(stats.ended_date)) {
        return stats;
    }

    var now = moment().format();

    switch (period) {
        case 'monthly':
            // are we starting a new month
            if (stats && stats.started_date && !moment(stats.started_date).isSame(date, 'month')) {
                stats = undefined;
            }
            break;
        case 'yearly':
            // are we starting a new month
            if (stats && stats.started_date && !moment(stats.started_date).isSame(date, 'year')) {
                stats = undefined;
            }
            break;
    }

    // no stats
    if (!stats) {
        stats = {
            created_date: now,
            started_date: date.clone().startOf('day').format(),
            updated_date: now,
            ended_date: date.clone().endOf('day').format(),

            present_days: 0,

            average_total_duration: 0,
            average_start_time: 0,
            average_end_time: 0,

            maximum_total_duration: 0,
            maximum_start_time: 0,
            maximum_end_time: 0,

            minimum_total_duration: 0,
            minimum_start_time: 0,
            minimum_end_time: 0
        };

        switch (period) {
            case 'monthly':
                stats.total_duration_by_day = {};
                stats.start_time_by_day = {};
                stats.end_time_by_day = {};
                stats.total_days = parseInt(date.clone().endOf('month').format('D'));
                break;
            case 'yearly':
                stats.total_days = parseInt(date.clone().endOf('year').diff(date.clone().startOf('year'), 'days'));
                break;
        }

    } else {
        stats.updated_date = now;
        stats.ended_date = date.clone().endOf('day').format();
    }

    // no daily stats
    if (!dailyStats) {
        dailyStats = {
            total_duration: 0,
            start_time: 0,
            end_time: 0
        };
    }

    var _stats = _.cloneDeep(stats);

    try {
        var result = this._computeEmployeePeriodStatsStartTime(employee, dailyStats, _stats, date, period);
        _stats.minimum_start_time = result[0];
        _stats.maximum_start_time = result[1];
        _stats.average_start_time = result[2];

        if (period === 'monthly') {
            _.extend(_stats.start_time_by_day, result[3]);
        }

        if (period === 'alltime') {
            _stats.previous_average_start_time = stats.average_start_time;
        }

        result = this._computeEmployeePeriodStatsEndTime(employee, dailyStats, _stats, date, period);
        _stats.minimum_end_time = result[0];
        _stats.maximum_end_time = result[1];
        _stats.average_end_time = result[2];

        if (period === 'monthly') {
            _.extend(_stats.end_time_by_day, result[3]);
        }

        if (period === 'alltime') {
            _stats.previous_average_end_time = stats.average_end_time;
        }

        result = this._computeEmployeePeriodStatsTotalDuration(employee, dailyStats, _stats, date, period);
        _stats.minimum_total_duration = result[0];
        _stats.maximum_total_duration = result[1];
        _stats.average_total_duration = result[2];
        _stats.present_days = result[3];

        if (period === 'monthly') {
            _.extend(_stats.total_duration_by_day, result[4]);
        }

        if (period === 'alltime') {
            _stats.previous_average_total_duration = stats.average_total_duration;
        }

    } catch (error) {
        throw new Error('unable to compute employee monthly stats');
    }

    _stats.period = period;

    return _stats;
});

presence.prototype._computeEmployeePeriodStatsStartTime = function (employee, dailyStats, stats, date, period) {
    if (!dailyStats) {
        throw new Error('unable to compute employee start time');
    }

    var startTimeByDay = {};
    startTimeByDay[date.clone().startOf('day').unix()] = dailyStats.start_time;

    if (stats.minimum_start_time == 0) {
        var minimumStartTime = dailyStats.start_time;
    } else {
        minimumStartTime = _.min([stats.minimum_start_time, dailyStats.start_time]);
    }
    var maximumStartTime = _.max([stats.maximum_start_time, dailyStats.start_time]);
    // https://en.wikipedia.org/wiki/Moving_average
    var averageStartTime = (dailyStats.start_time + stats.present_days * stats.average_start_time) / (stats.present_days + 1);

    var stat = [minimumStartTime, maximumStartTime, averageStartTime];

    if (period === 'monthly') {
        stat.push(startTimeByDay);
    }

    return stat;
};

presence.prototype._computeEmployeePeriodStatsEndTime = function (employee, dailyStats, stats, date, period) {
    if (!dailyStats.end_time || dailyStats.end_time == 0) {
        throw new Error('unable to compute employee monthly end time');
    }

    var endTimeByDay = {};
    endTimeByDay[date.clone().startOf('day').unix()] = dailyStats.end_time;

    if (stats.minimum_end_time == 0) {
        var minimumEndTime = dailyStats.end_time;
    } else {
        minimumEndTime = _.min([stats.minimum_end_time, dailyStats.end_time]);
    }
    var maximumEndTime = _.max([stats.maximum_end_time, dailyStats.end_time]);
    // https://en.wikipedia.org/wiki/Moving_average
    var averageEndTime = (dailyStats.end_time + stats.present_days * stats.average_end_time) / (stats.present_days + 1);

    var stat = [minimumEndTime, maximumEndTime, averageEndTime];

    if (period === 'monthly') {
        stat.push(endTimeByDay);
    }

    return stat;
};

presence.prototype._computeEmployeePeriodStatsTotalDuration = function (employee, dailyStats, stats, date, period) {
    if (!dailyStats.total_duration || dailyStats.total_duration == 0) {
        throw new Error('unable to compute employee total duration');
    }

    var totalDurationByDay = {};
    totalDurationByDay[date.clone().startOf('day').unix()] = dailyStats.total_duration;

    var presentDays = stats.present_days + 1;

    if (stats.minimum_total_duration == 0) {
        var minimumTotalDuration = dailyStats.total_duration;
    } else {
        minimumTotalDuration = _.min([stats.minimum_total_duration, dailyStats.total_duration]);
    }
    var maximumTotalDuration = _.max([stats.maximum_total_duration, dailyStats.total_duration]);
    // https://en.wikipedia.org/wiki/Moving_average
    var averageTotalDuration = (dailyStats.total_duration + stats.present_days * stats.average_total_duration) / (stats.present_days + 1);

    var stat = [minimumTotalDuration, maximumTotalDuration, averageTotalDuration, presentDays];

    if (period === 'monthly') {
        stat.push(totalDurationByDay);
    }

    return stat;
};

module.exports = presence;