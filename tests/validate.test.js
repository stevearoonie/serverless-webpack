'use strict';

const _ = require('lodash');
const chai = require('chai');
const sinon = require('sinon');
const mockery = require('mockery');
const Serverless = require('serverless');
const path = require('path');
const makeFsExtraMock = require('./fs-extra.mock');
chai.use(require('sinon-chai'));
const expect = chai.expect;

const globMock = {
  sync() {}
};

describe('validate', () => {
  let fsExtraMock;
  let baseModule;
  let module;
  let serverless;
  let sandbox;

  before(() => {
    sandbox = sinon.sandbox.create();

    mockery.enable({ warnOnUnregistered: false });
    fsExtraMock = makeFsExtraMock();
    mockery.registerMock('fs-extra', fsExtraMock);
    mockery.registerMock('glob', globMock);
    baseModule = require('../lib/validate');
    Object.freeze(baseModule);
  });

  after(() => {
    mockery.disable();
    mockery.deregisterAll();
  });

  beforeEach(() => {
    serverless = new Serverless();
    serverless.cli = {
      log: sandbox.stub()
    };
    fsExtraMock._resetSpies();
    module = Object.assign({
      serverless,
      options: {},
    }, baseModule);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should expose a `validate` method', () => {
    expect(module.validate).to.be.a('function');
  });

  it('should set `webpackConfig` in the context to `custom.webpack` option', () => {
    const testConfig = {
      entry: 'test',
      context: 'testcontext',
      output: {},
    };
    module.serverless.service.custom.webpack = testConfig;
    return module
      .validate()
      .then(() => {
        expect(module.webpackConfig).to.eql(testConfig);
      });
  });

  it('should delete the output path', () => {
    const testOutPath = 'test';
    const testConfig = {
      entry: 'test',
      context: 'testcontext',
      output: {
        path: testOutPath,
      },
    };
    module.serverless.service.custom.webpack = testConfig;
    return module
      .validate()
      .then(() => {
        expect(fsExtraMock.removeSync).to.have.been.calledWith(testOutPath);
      });
  });

  it('should override the output path if `out` option is specified', () => {
    const testConfig = {
      entry: 'test',
      context: 'testcontext',
      output: {
        path: 'originalpath',
        filename: 'filename',
      },
    };
    const testServicePath = 'testpath';
    const testOptionsOut = 'testdir';
    module.options.out = testOptionsOut;
    module.serverless.config.servicePath = testServicePath;
    module.serverless.service.custom.webpack = testConfig;
    return module
      .validate()
      .then(() => {
        expect(module.webpackConfig.output).to.eql({
          path: `${testServicePath}/${testOptionsOut}`,
          filename: 'filename',
        });
      });
  });

  it('should set a default `webpackConfig.context` if not present', () => {
    const testConfig = {
      entry: 'test',
      output: {},
    };
    const testServicePath = 'testpath';
    module.serverless.config.servicePath = testServicePath;
    module.serverless.service.custom.webpack = testConfig;
    return module
      .validate()
      .then(() => {
        expect(module.webpackConfig.context).to.equal(testServicePath);
      });
  });

  describe('default output', () => {
    it('should set a default `webpackConfig.output` if not present', () => {
      const testEntry = 'testentry';
      const testConfig = {
        entry: testEntry,
      };
      const testServicePath = 'testpath';
      module.serverless.config.servicePath = testServicePath;
      module.serverless.service.custom.webpack = testConfig;
      return module
        .validate()
        .then(() => {
          expect(module.webpackConfig.output).to.eql({
            libraryTarget: 'commonjs',
            path: `${testServicePath}/.webpack`,
            filename: 'testentry',
          });
        });
    });

    it('should set a default `webpackConfig.output.filename` if `entry` is an array', () => {
      const testEntry = ['first', 'second', 'last'];
      const testConfig = {
        entry: testEntry,
      };
      const testServicePath = 'testpath';
      module.serverless.config.servicePath = testServicePath;
      module.serverless.service.custom.webpack = testConfig;
      return module
        .validate()
        .then(() => {
          expect(module.webpackConfig.output).to.eql({
            libraryTarget: 'commonjs',
            path: `${testServicePath}/.webpack`,
            filename: 'last',
          });
        });
    });

    it('should set a default `webpackConfig.output.filename` if `entry` is not defined', () => {
      const testConfig = {};
      const testServicePath = 'testpath';
      module.serverless.config.servicePath = testServicePath;
      module.serverless.service.custom.webpack = testConfig;
      return module
        .validate()
        .then(() => {
          expect(module.webpackConfig.output).to.eql({
            libraryTarget: 'commonjs',
            path: `${testServicePath}/.webpack`,
            filename: 'handler.js',
          });
        });
    });
  });

  describe('config file load', () => {
    it('should load a webpack config from file if `custom.webpack` is a string', () => {
      const testConfig = 'testconfig'
      const testServicePath = 'testpath';
      const requiredPath = `${testServicePath}/${testConfig}`;
      module.serverless.config.servicePath = testServicePath;
      module.serverless.service.custom.webpack = testConfig;
      serverless.utils.fileExistsSync = sinon.stub().returns(true);
      const loadedConfig = {
        entry: 'testentry',
      };
      mockery.registerMock(requiredPath, loadedConfig);
      return module
        .validate()
        .then(() => {
          expect(serverless.utils.fileExistsSync).to.have.been.calledWith(requiredPath);
          expect(module.webpackConfig).to.eql(loadedConfig);
          mockery.deregisterMock(requiredPath);
        });
    });

    it('should throw if providing an invalid file', () => {
      const testConfig = 'testconfig'
      const testServicePath = 'testpath';
      const requiredPath = `${testServicePath}/${testConfig}`;
      module.serverless.config.servicePath = testServicePath;
      module.serverless.service.custom.webpack = testConfig;
      serverless.utils.fileExistsSync = sinon.stub().returns(false);
      const loadedConfig = {
        entry: 'testentry',
      };
      expect(module.validate.bind(module)).to.throw(/could not find/);
    });

    it('should load a default file if no custom config is provided', () => {
      const testConfig = 'webpack.config.js';
      const testServicePath = 'testpath';
      const requiredPath = `${testServicePath}/${testConfig}`;
      module.serverless.config.servicePath = testServicePath;
      serverless.utils.fileExistsSync = sinon.stub().returns(true);
      const loadedConfig = {
        entry: 'testentry',
      };
      mockery.registerMock(requiredPath, loadedConfig);
      return module
        .validate()
        .then(() => {
          expect(serverless.utils.fileExistsSync).to.have.been.calledWith(requiredPath);
          expect(module.webpackConfig).to.eql(loadedConfig);
          mockery.deregisterMock(requiredPath);
        });
    });
  });

  describe('lib', () => {
    it('should expose the serverless instance', () => {
      const testOutPath = 'test';
      const testConfig = {
        entry: 'test',
        context: 'testcontext',
        output: {
          path: testOutPath,
        },
      };
      module.serverless.service.custom.webpack = testConfig;
      return expect(module.validate()).to.be.fulfilled
      .then(() => {
        const lib = require('../lib/index');
        expect(lib.serverless).to.equal(serverless);
      });
    });

    it('should expose the plugin options', () => {
      const testOutPath = 'test';
      const testConfig = {
        entry: 'test',
        context: 'testcontext',
        output: {
          path: testOutPath,
        },
      };
      const testOptions = {
        stage: 'testStage',
        verbose: true
      };
      const configuredModule = Object.assign({
        serverless,
        options: _.cloneDeep(testOptions),
      }, baseModule);
      configuredModule.serverless.service.custom.webpack = testConfig;
      return expect(configuredModule.validate()).to.be.fulfilled
      .then(() => {
        const lib = require('../lib/index');
        expect(lib.options).to.deep.equal(testOptions);
      });
    });

    describe('entries', () => {
      let globSyncStub;

      beforeEach(() => {
        globSyncStub = sandbox.stub(globMock, 'sync');
      });

      const testFunctionsConfig = {
        func1: {
          handler: 'module1.func1handler',
          artifact: 'artifact-func1.zip',
          events: [{
            http: {
              method: 'get',
              path: 'func1path',
            },
          }],
        },
        func2: {
          handler: 'module2.func2handler',
          artifact: 'artifact-func2.zip',
          events: [{
            http: {
              method: 'POST',
              path: 'func2path',
            },
          }, {
            nonhttp: 'non-http',
          }],
        },
        func3: {
          handler: 'handlers/func3/module2.func3handler',
          artifact: 'artifact-func3.zip',
          events: [{
            nonhttp: 'non-http',
          }],
        },
        func4: {
          handler: 'handlers/module2/func3/module2.func3handler',
          artifact: 'artifact-func3.zip',
          events: [{
            nonhttp: 'non-http',
          }],
        },
      };

      it('should expose all functions if `options.function` is not defined', () => {
        const testOutPath = 'test';
        const testConfig = {
          entry: 'test',
          context: 'testcontext',
          output: {
            path: testOutPath,
          },
        };
        module.serverless.service.custom.webpack = testConfig;
        module.serverless.service.functions = testFunctionsConfig;
        globSyncStub.callsFake(filename => [ _.replace(filename, '*', 'js') ]);
        return expect(module.validate()).to.be.fulfilled
        .then(() => {
          const lib = require('../lib/index');
          const expectedLibEntries = {
            'module1': './module1.js',
            'module2': './module2.js',
            'handlers/func3/module2': './handlers/func3/module2.js',
            'handlers/module2/func3/module2': './handlers/module2/func3/module2.js',
          };

          expect(lib.entries).to.deep.equal(expectedLibEntries);
          expect(globSyncStub).to.have.callCount(4);
          expect(serverless.cli.log).to.not.have.been.called;
        });
      });

      it('should expose the requested function if `options.function` is defined and the function is found', () => {
        const testOutPath = 'test';
        const testFunction = 'func1';
        const testConfig = {
          entry: 'test',
          context: 'testcontext',
          output: {
            path: testOutPath,
          },
        };
        module.serverless.service.custom.webpack = testConfig;
        module.serverless.service.functions = testFunctionsConfig;
        module.options.function = testFunction;
        globSyncStub.callsFake(filename => [ _.replace(filename, '*', 'js') ]);
        return expect(module.validate()).to.be.fulfilled
        .then(() => {
          const lib = require('../lib/index');
          const expectedLibEntries = {
            'module1': './module1.js'
          };

          expect(lib.entries).to.deep.equal(expectedLibEntries)
          expect(globSyncStub).to.have.been.calledOnce;
          expect(serverless.cli.log).to.not.have.been.called;
        });
      });

      it('should show a warning if more than one matching handler is found', () => {
        const testOutPath = 'test';
        const testFunction = 'func1';
        const testConfig = {
          entry: 'test',
          context: 'testcontext',
          output: {
            path: testOutPath,
          },
        };
        module.serverless.service.custom.webpack = testConfig;
        module.serverless.service.functions = testFunctionsConfig;
        module.options.function = testFunction;
        globSyncStub.returns([ 'module1.ts', 'module1.js' ]);
        return expect(module.validate()).to.be.fulfilled
        .then(() => {
          const lib = require('../lib/index');
          const expectedLibEntries = {
            'module1': './module1.ts'
          };

          expect(lib.entries).to.deep.equal(expectedLibEntries)
          expect(globSyncStub).to.have.been.calledOnce;
          expect(serverless.cli.log).to.have.been.calledOnce;
          expect(serverless.cli.log).to.have.been.calledWith(
            'WARNING: More than one matching handlers found for \'module1\'. Using \'module1.ts\'.'
          );
        });
      });

      it('should select the most probable handler if multiple hits are found', () => {
        const testOutPath = 'test';
        const testFunction = 'func1';
        const testConfig = {
          entry: 'test',
          context: 'testcontext',
          output: {
            path: testOutPath,
          },
        };
        module.serverless.service.custom.webpack = testConfig;
        module.serverless.service.functions = testFunctionsConfig;
        module.options.function = testFunction;
        globSyncStub.returns([ 'module1.doc', 'module1.json', 'module1.test.js', 'module1.ts', 'module1.js' ]);
        return expect(module.validate()).to.be.fulfilled
        .then(() => {
          const lib = require('../lib/index');
          const expectedLibEntries = {
            'module1': './module1.ts'
          };

          expect(lib.entries).to.deep.equal(expectedLibEntries)
          expect(globSyncStub).to.have.been.calledOnce;
          expect(serverless.cli.log).to.have.been.calledOnce;
          expect(serverless.cli.log).to.have.been.calledWith(
            'WARNING: More than one matching handlers found for \'module1\'. Using \'module1.ts\'.'
          );
        });
      });

      it('should throw an exception if no handler is found', () => {
        const testOutPath = 'test';
        const testFunction = 'func1';
        const testConfig = {
          entry: 'test',
          context: 'testcontext',
          output: {
            path: testOutPath,
          },
        };
        module.serverless.service.custom.webpack = testConfig;
        module.serverless.service.functions = testFunctionsConfig;
        module.options.function = testFunction;
        globSyncStub.returns([]);
        expect(() => {
          module.validate();
        }).to.throw(/No matching handler found for/);
      });

      it('should throw an exception if `options.function` is defined but not found in entries from serverless.yml', () => {
        const testOutPath = 'test';
        const testFunction = 'test';
        const testConfig = {
          entry: 'test',
          context: 'testcontext',
          output: {
            path: testOutPath,
          },
        };
        module.serverless.service.custom.webpack = testConfig;
        module.serverless.service.functions = testFunctionsConfig;
        module.options.function = testFunction;
        expect(() => {
          module.validate();
        }).to.throw(new RegExp(`^Function "${testFunction}" doesn't exist`));
      });
    });
  });
});
