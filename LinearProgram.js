/* jslint node: true */
'use strict';

var lp_solve = require('bindings')('lp_solve');
var Row = require('./Row.js');
var semaphore = require('semaphore')(1);

function LinearProgram() {
	this.Columns = { };
	this.lprec = new lp_solve.make_lp(0, 0);
	this.Constraints = [];
	this.ObjectiveFunc = new Row();
}

LinearProgram.prototype.setOutputFile = function(fname) {
	var str = typeof fname !== 'undefined' ? String(fname) : '';

	if (!this.lprec.set_outputfile(str)) {
		throw new Error('error writing to file \'' + str + '\'');
	}

	return this;
};

LinearProgram.prototype.addColumn = function(name, isInteger, isBinary) {

	var id = this.Columns[name] = Object.keys(this.Columns).length + 1;

	if (name === undefined) {
		name = "unamed_" + id;
	}

	//console.log(name, isInteger, isBinary);
	this.lprec.add_column(null);

	this.lprec.set_col_name(id, name);

	if (isInteger === true) {
		this.lprec.set_int(id, true);
	}

	if (isBinary === true) {
		this.lprec.set_bool(id, true);
	}

	return name;
};

LinearProgram.ConstraintTypes = {'LE':1,'EQ':3,'GE':2,'<=':1,'=':3,'>=':2};
LinearProgram.ConstraintText = {'LE':'<=','EQ':'=','GE':'>='};

LinearProgram.prototype.addConstraint = function(row, constraint, constant, name) {
	var rowId = [];
	var rowValues = [];
	var raw = row.raw;

	for (var k in raw) {
		if (k !== 'constant') {
			rowValues.push(raw[k]);
			rowId.push(this.Columns[k]);
		} else {
			constant -= raw[k];
		}
	}

	var constrainttype = LinearProgram.ConstraintTypes[constraint];

	this.Constraints.push({ name: name, row: row.ToText(), constraint: constraint, constant: constant });

	return this.lprec.add_constraintex(rowId.length, rowValues, rowId, constrainttype, constant) &&
		   this.lprec.set_row_name(this.lprec.get_Nrows(), name || "unamed row");


};

LinearProgram.prototype.setObjective = function(row, minimize) {
	var rowId = [];
	var rowValues = [];
	var raw = row.raw;

	for (var k in raw) {
		if (k !== 'constant') {
			rowValues.push(raw[k]);
			rowId.push(this.Columns[k]);
		} else {
			this.adjustObjective = raw[k];
		}
	}

	if (minimize === undefined) minimize = true;

	this.ObjectiveFunc = { minimize: minimize, row: row };

	return this.lprec.set_obj_fnex(rowValues.length, rowValues, rowId) &&
		  ( (minimize || false) ? this.lprec.set_minim() : this.lprec.set_maxim() );
};

LinearProgram.SolveResult = {
	'-5': 'UNKNOWNERROR',
	'-4': 'DATAIGNORED',
	'-3': 'NOBFP',
	'-2': 'NOMEMORY',
	'-1': 'NOTRUN',
	'0': 'OPTIMAL',
	'1': 'SUBOPTIMAL',
	'2': 'INFEASIBLE',
	'3': 'UNBOUNDED',
	'4': 'DEGENERATE',
	'5': 'NUMFAILURE',
	'6': 'USERABORT',
	'7': 'TIMEOUT',
	'8': 'RUNNING',
	'9': 'PRESOLVED'
};

LinearProgram.prototype.solve = function() {
	var res = this.lprec.solve();

	if (res === 0 || res == 1 || res == 9)
		this.solutionVariables = this.getSolutionVariables();

	return { code: res, description: LinearProgram.SolveResult[res] };
};

LinearProgram.prototype.solveAsync = function(callback) {
	var that = this;
	//semaphore.take(function() {
		that.lprec.solve_async(function (err, res) {
			//semaphore.leave();
			if (res === 0 || res == 1 || res == 9)
				that.solutionVariables = that.getSolutionVariables();

			callback({ code: res, description: LinearProgram.SolveResult[res] });
		});
	//});
};

LinearProgram.prototype.getObjectiveValue = function() {
	return this.lprec.get_objective() + (this.adjustObjective || 0);
};

LinearProgram.prototype.getSolutionVariables = function() {
	var ret = [];
	if (!this.lprec.get_variables(ret))
		return null;
	return ret;
};

LinearProgram.prototype.calculate = function(row) {
	var val = 0;
	var raw = row.raw;
	for (var k in raw) {
		val += this.get(k) * raw[k];
	}
	return val;
};

LinearProgram.prototype.get = function(variable) {
	if (variable == 'constant') return 1;
	return this.solutionVariables ? this.solutionVariables[this.Columns[variable] - 1] : null;
};

LinearProgram.prototype.dumpProgram = function() {
	var ret = (this.ObjectiveFunc.minimize ? 'minimize' : 'maximize') + ':' + this.ObjectiveFunc.row.ToText() + ';\n';
	for (var v in this.Constraints) {
		var c = this.Constraints[v];
		ret += (c.name ? (c.name + ': '): '') + c.row + ' ' + LinearProgram.ConstraintText[c.constraint] + ' ' + c.constant + ';\n';
	}
	return ret;
};

module.exports = LinearProgram;
