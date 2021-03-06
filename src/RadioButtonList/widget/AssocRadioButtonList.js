/*jslint white:true, nomen: true, plusplus: true */
/*global mx, define, require, browser, devel, console, document, jQuery, mxui, dojo */
/*mendix */
define([
	"dojo/_base/declare",
	"mxui/widget/_WidgetBase",
	"dijit/_TemplatedMixin",
	"mxui/dom",
	"dojo/dom-class",
	"dojo/dom-style",
	"dojo/dom-construct",
	"dojo/dom-attr",
	"dojo/_base/lang",
	"dojo/html",
	"dojo/text!RadioButtonList/widget/template/RadioButtonList.html"
],
	function (declare, _WidgetBase, _TemplatedMixin, dom, dojoClass, dojoStyle, dojoConstruct, dojoAttr, dojoLang, dojoHtml, widgetTemplate) {
		"use strict";

		// Declare widget.
		return declare("RadioButtonList.widget.AssocRadioButtonList", [_WidgetBase, _TemplatedMixin], {

			// Template path
			templateString: widgetTemplate,

			// DOM elements
			inputNodes: null,

			// Parameters configurable in Business Modeler.
			dataSourceType: null,
			RadioListObject: null,
			Constraint: "",
			sortAttr: "",
			sortOrder: false,
			RadioListItemAttribute: "",
			entity: null,
			direction: "vertical",
			readonly: false,
			onchangeAction: "",

			// Internal variables. Non-primitives created in the prototype are shared between all widget instances.
			_handles: null,
			_contextObj: null,
			_alertDiv: null,
			_radioButtonOptions: null,
			_isReadOnly: false,
			_assocName: null,

			/**
			 * Mendix Widget methods.
			 * ======================
			 */
			constructor: function () {
				this._handles = [];
			},

			// DOJO.WidgetBase -> PostCreate is fired after the properties of the widget are set.
			postCreate: function () {

				this._assocName = (typeof this.entity !== 'undefined' && this.entity !== '') ? this.entity.split("/")[0] : '';
				this.entity = this._assocName; //to catch data validation

				if (this.readOnly || this.get('disabled') || this.readonly) {
					//this.readOnly isn't available in client API, this.get('disabled') works correctly since 5.18.
					//this.readonly is a widget property
					this._isReadOnly = true;
				}

				this._updateRendering();
			},

			/**
			 * What to do when data is loaded?
			 */

			update: function (obj, callback) {
				console.debug(this.id + ".update");

				this._contextObj = obj;
				this._resetSubscriptions();
				this._setRadiobuttonOptions();

				callback();

			},

			// mxui.widget._WidgetBase.enable is called when the widget should enable editing. Implement to enable editing if widget is input widget.
			enable: function () {},

			// mxui.widget._WidgetBase.enable is called when the widget should disable editing. Implement to disable editing if widget is input widget.
			disable: function () {},

			// mxui.widget._WidgetBase.resize is called when the page's layout is recalculated. Implement to do sizing calculations. Prefer using CSS instead.
			resize: function (box) {},

			// mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
			uninitialize: function () {
				// Clean up listeners, helper objects, etc. There is no need to remove listeners added with this.connect / this.subscribe / this.own.
			},


			_setRadiobuttonOptions: function () {

				if (this.dataSourceType === "xpath") {
					this._getDataFromXPath();
				} else if (this.dataSourceType === "mf" && this.datasourceMf) {
					this._getDataFromDatasource();
				} else {
					this._showError("Can\"t retrieve objects because no datasource microflow is specified");
				}
				
				dojoConstruct.empty(this.inputNodes);
			},

			// Rerender the interface.
			_updateRendering: function () {

				if (this._contextObj !== null) {
					dojoStyle.set(this.domNode, "display", "block");

					this._createRadiobuttonNodes();

				} else {
					dojoStyle.set(this.domNode, "display", "none");
				}

				// Important to clear all validations!
				this._clearValidations();
			},

			// Handle validations.
			_handleValidation: function (validations) {
				this._clearValidations();

				var validation = validations[0],
					message = validation.getReasonByAttribute(this.entity);

				if (this._isReadOnly ||
					this._contextObj.isReadonlyAttr(this.entity)) {
					validation.removeAttribute(this.entity);
				} else if (message) {
					this._addValidation(message);
					validation.removeAttribute(this.entity);
				}
			},

			// Clear validations.
			_clearValidations: function () {
				dojoConstruct.destroy(this._alertDiv);
				this._alertDiv = null;
			},

			// Show an error message.
			_showError: function (message) {
				if (this._alertDiv !== null) {
					dojoHtml.set(this._alertDiv, message);
					return true;
				}
				this._alertDiv = dojoConstruct.create("div", {
					"class": "alert alert-danger",
					"innerHTML": message
				});
				dojoConstruct.place(this._alertDiv, this.domNode);
			},

			// Add a validation.
			_addValidation: function (message) {
				this._showError(message);
			},

			// Reset subscriptions.
			_resetSubscriptions: function () {

				var validationHandle = null,
					objectHandle = null,
					attrHandle = null;

				// Release handles on previous object, if any.
				if (this._handles) {
					this._handles.forEach(function (handle) {
						mx.data.unsubscribe(handle);
					});
					this._handles = [];
				}

				// When a mendix object exists create subscribtions. 
				if (this._contextObj) {
					validationHandle = mx.data.subscribe({
						guid: this._contextObj.getGuid(),
						val: true,
						callback: dojoLang.hitch(this, this._handleValidation)
					});

					objectHandle = mx.data.subscribe({
						guid: this._contextObj.getGuid(),
						callback: dojoLang.hitch(this, function (guid) {
							this._updateRendering();
						})
					});

					attrHandle = mx.data.subscribe({
						guid: this._contextObj.getGuid(),
						attr: this.entity,
						callback: dojoLang.hitch(this, function (guid, attr, attrValue) {
							this._updateRendering();
						})
					});

					this.handles = [validationHandle, objectHandle, attrHandle];
				}
			},

			_getDataFromXPath: function () {
				if (this._contextObj) {
					mx.data.get({
						xpath: "//" + this.RadioListObject + this.Constraint.replace(/\[%CurrentObject%\]/g, this._contextObj.getGuid()),
						filter: {
							limit: 50,
							depth: 0,
							sort: [[this.sortAttr, this.sortOrder]]
						},
						callback: dojoLang.hitch(this, this._populateRadiobuttonOptions)
					});
				} else {
					console.warn("Warning: No context object available.");
				}
			},

			_getDataFromDatasource: function () {
				this._execMF(this._contextObj, this.datasourceMf, dojoLang.hitch(this, this._populateRadiobuttonOptions));
			},

			_populateRadiobuttonOptions: function (objs) {

				var mxObj = null,
					i = 0;
				
				this._radioButtonOptions = {};
				for (i = 0; i < objs.length; i++) {

					mxObj = objs[i];

					this._radioButtonOptions[mxObj.getGuid()] = mxObj.get(this.RadioListItemAttribute);
				}
				this._updateRendering();
			},


			_createRadiobuttonNodes: function (mxObjArr) {
				var mxObj = null,
					i = null,
					labelNode = null,
					radioButtonNode = null,
					enclosingDivElement = null;

				dojoConstruct.empty(this.inputNodes);

				for (var option in this._radioButtonOptions) {
					if (this._radioButtonOptions.hasOwnProperty(option)) {

						labelNode = this._createLabelNode(option, this._radioButtonOptions[option]);
						radioButtonNode = this._createRadiobuttonNode(option, this._radioButtonOptions[option]);

						this._addOnclickToRadiobuttonItem(labelNode, radioButtonNode, i);

						dojoConstruct.place(radioButtonNode, labelNode, "first");

						if(this.direction === "horizontal"){
							dojoConstruct.place(labelNode, this.inputNodes, "last");
						} else {
							//an enclosing div element is required to vertically align a radiobuttonlist in bootstrap. 
							enclosingDivElement = dojoConstruct.create("div", {"class" : "radio"});
							dojoConstruct.place(labelNode, enclosingDivElement, "last");
							dojoConstruct.place(enclosingDivElement, this.inputNodes, "last");
						}

						i++;
					}
				}
			},

			_createLabelNode: function (key, value) {

				var labelNode = null;

				labelNode = dojoConstruct.create("label");

				if (this._isReadOnly ||
					this._contextObj.isReadonlyAttr(this.entity)) {
					dojoAttr.set(labelNode, "disabled", "disabled");
					dojoAttr.set(labelNode, "readonly", "readonly");
				}

				if ("" + this._contextObj.get(this.entity) === key) {
					dojoClass.add(labelNode, "checked");
				}

				if (this.direction === "horizontal") {
					dojoClass.add(labelNode, "radio-inline");
				}

				dojoConstruct.place(dojoConstruct.create("span", {
					"innerHTML": value
				}), labelNode);

				return labelNode;
			},

			_createRadiobuttonNode: function (key, value, index) {
				var radiobuttonNode = null;

				radiobuttonNode = dojoConstruct.create("input", {
					"type": "radio",
					"value": key,
					"id": this.entity + "_" + this.id + "_" + index
				});

				dojoAttr.set(radiobuttonNode, "name", "radio" + this._contextObj.getGuid() + "_" + this.id);

				if (this._isReadOnly ||
					this._contextObj.isReadonlyAttr(this.entity)) {
					dojoAttr.set(radiobuttonNode, "disabled", "disabled");
					dojoAttr.set(radiobuttonNode, "readonly", "readonly");
				}

				if ("" + this._contextObj.get(this.entity) === key) {
					dojoAttr.set(radiobuttonNode, "defaultChecked", true);
				}

				return radiobuttonNode;
			},

			_addOnclickToRadiobuttonItem: function (labelNode, radiobuttonNode) {

				this.connect(labelNode, "onclick", dojoLang.hitch(this, function () {

					if (this._isReadOnly || 
						this._contextObj.isReadonlyAttr(this.entity)) {
						return;
					}

					dojoAttr.set(radiobuttonNode, "checked", true);
					this._contextObj.set(this.entity, dojoAttr.get(radiobuttonNode, "value"));

					if (this.onchangeAction) {
						mx.data.action({
							params: {
								applyto: "selection",
								actionname: this.onchangeAction,
								guids: [this._contextObj.getGuid()]
							},
							error: function (error) {
								console.log("RadioButtonList.widget.AttrRadioButtonList._addOnclickToRadiobuttonItem: XAS error executing microflow; " + error.description);
							}
						});
					}
				}));
			},

			_execMF: function (obj, mf, callback) {
				console.log("AssocRadioButtonList - execmf");
				var params = {
					applyto: "selection",
					actionname: mf,
					guids: []
				};
				if (obj) {
					params.guids = [obj.getGuid()];
				}
				mx.data.action({
					params: params,
					callback: function (objs) {
						if (typeof callback !== "undefined") {
							callback(objs);
						}
					},
					error: function (error) {
						if (typeof callback !== "undefined") {
							callback();
						}
						console.log(error.description);
					}
				}, this);
			}

		});
	});
require(["RadioButtonList/widget/AssocRadioButtonList"], function () {
	"use strict";
});