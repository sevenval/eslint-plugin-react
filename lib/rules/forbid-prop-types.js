/**
 * @fileoverview Forbid certain propTypes
 */
'use strict';

const variableUtil = require('../util/variable');
const propsUtil = require('../util/props');

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const DEFAULTS = ['any', 'array', 'object'];

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

module.exports = {
  meta: {
    docs: {
      description: 'Forbid certain propTypes',
      category: 'Best Practices',
      recommended: false
    },

    schema: [{
      type: 'object',
      properties: {
        forbid: {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      },
      additionalProperties: true
    }]
  },

  create: function(context) {
    const propWrapperFunctions = new Set(context.settings.propWrapperFunctions || []);

    function isForbidden(type) {
      const configuration = context.options[0] || {};

      const forbid = configuration.forbid || DEFAULTS;
      return forbid.indexOf(type) >= 0;
    }

    /**
     * Find a variable by name in the current scope.
     * @param  {string} name Name of the variable to look for.
     * @returns {ASTNode|null} Return null if the variable could not be found, ASTNode otherwise.
     */
    function findVariableByName(name) {
      const variable = variableUtil.variablesInScope(context).find(item => item.name === name);

      if (!variable || !variable.defs[0] || !variable.defs[0].node) {
        return null;
      }

      if (variable.defs[0].node.type === 'TypeAlias') {
        return variable.defs[0].node.right;
      }

      return variable.defs[0].node.init;
    }


    /**
     * Checks if propTypes declarations are forbidden
     * @param {Array} declarations The array of AST nodes being checked.
     * @returns {void}
     */
    function checkProperties(declarations) {
      declarations.forEach(declaration => {
        if (declaration.type !== 'Property') {
          return;
        }
        let target;
        let value = declaration.value;
        if (
          value.type === 'MemberExpression' &&
          value.property &&
          value.property.name &&
          value.property.name === 'isRequired'
        ) {
          value = value.object;
        }
        if (
          value.type === 'CallExpression' &&
          value.callee.type === 'MemberExpression'
        ) {
          value = value.callee;
        }
        if (value.property) {
          target = value.property.name;
        } else if (value.type === 'Identifier') {
          target = value.name;
        }
        if (isForbidden(target)) {
          context.report({
            node: declaration,
            message: `Prop type \`${target}\` is forbidden`
          });
        }
      });
    }

    function checkNode(node) {
      switch (node && node.type) {
        case 'ObjectExpression':
          checkProperties(node.properties);
          break;
        case 'Identifier':
          const propTypesObject = findVariableByName(node.name);
          if (propTypesObject && propTypesObject.properties) {
            checkProperties(propTypesObject.properties);
          }
          break;
        case 'CallExpression':
          const innerNode = node.arguments && node.arguments[0];
          if (propWrapperFunctions.has(node.callee.name) && innerNode) {
            checkNode(innerNode);
          }
          break;
        default:
          break;
      }
    }

    return {
      ClassProperty: function(node) {
        if (!propsUtil.isPropTypesDeclaration(node)) {
          return;
        }
        checkNode(node.value);
      },

      MemberExpression: function(node) {
        if (!propsUtil.isPropTypesDeclaration(node)) {
          return;
        }

        checkNode(node.parent.right);
      },

      ObjectExpression: function(node) {
        node.properties.forEach(property => {
          if (!property.key) {
            return;
          }

          if (!propsUtil.isPropTypesDeclaration(property)) {
            return;
          }
          if (property.value.type === 'ObjectExpression') {
            checkProperties(property.value.properties);
          }
        });
      }

    };
  }
};
